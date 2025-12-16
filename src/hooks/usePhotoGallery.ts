import { useEffect, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { Photo } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { isPlatform } from '@ionic/react';
import { Capacitor } from '@capacitor/core';

// Shared photo gallery hook.
//
// Responsibilities:
// - Save photos to app storage (Filesystem + Preferences) so Tab2 can display a persistent gallery.
// - Provide helpers for other pages (Tab3 / NoteDetail) to also save into the same gallery store.
// - Support deletion from gallery (removes from Preferences/state and deletes the underlying file).

export function usePhotoGallery() {
    const [photos, setPhotos ] = useState<UserPhoto[]>([]);
    const PHOTO_STORAGE = 'photos';

    useEffect(() => {
        reloadPhotos();
    }, []);

    const reloadPhotos = async () => {
        // Load list from Preferences and, on web, hydrate the image data into a data URL.
        const { value: photoList } = await Preferences.get({ key: PHOTO_STORAGE});
        const photosInPreferences = (photoList ? JSON.parse(photoList) : []) as UserPhoto[];
        
        if (!isPlatform('hybrid')) {
            for (const photo of photosInPreferences) {
                const readFile = await Filesystem.readFile({
                    path: photo.filepath,
                    directory: Directory.Data,
                });
                photo.webviewPath = `data:image/jpeg;base64,${readFile.data}`;
            }
        }

        setPhotos(photosInPreferences);
    };

    const addNewToGallery = async () => {
        // Capture a new photo and persist it to the shared gallery.
        const capturedPhoto = await Camera.getPhoto({
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
            quality: 100,
        });

        await savePhotoToGallery(capturedPhoto);
    };

    const savePhotoToGallery = async (photo: Photo) => {
        // Persist a Camera Photo into our gallery store.
        const fileName = Date.now() + '.jpg';
        const savedImageFile = await savePicture(photo, fileName);
        let newPhotos: UserPhoto[] = [];
        setPhotos((current) => {
            newPhotos = [savedImageFile, ...current];
            return newPhotos;
        });
        Preferences.set({ key: PHOTO_STORAGE, value: JSON.stringify(newPhotos) });
        return savedImageFile;
    };

    const deletePhotoFromGallery = async (photo: UserPhoto) => {
        // Remove from UI + Preferences first (so the UI feels immediate).
        setPhotos((current) => {
            const next = current.filter((p) => p.filepath !== photo.filepath);
            Preferences.set({ key: PHOTO_STORAGE, value: JSON.stringify(next) });
            return next;
        });

        try {
            // Also delete the underlying file so it doesn't accumulate in app storage.
            if (isPlatform('hybrid')) {
                await Filesystem.deleteFile({ path: photo.filepath });
            } else {
                await Filesystem.deleteFile({ path: photo.filepath, directory: Directory.Data });
            }
        } catch {
            // Ignore delete errors (file may already be gone)
        }
    };

    const savePicture = async (photo: Photo, fileName: string): Promise<UserPhoto> => {
        // Convert to base64 data and write to Filesystem.
        let base64Data: string | Blob;

        if (isPlatform('hybrid')) {
            const readFile = await Filesystem.readFile({
                path: photo.path!,
            });
            base64Data = readFile.data;
        } else {
            const response = await fetch(photo.webPath!);
            const blob = await response.blob();
            base64Data = (await convertBlobToBase64(blob)) as string;
        }
        
        const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Data,
        });

        if (isPlatform('hybrid')) {
            return {
                filepath: savedFile.uri,
                webviewPath: Capacitor.convertFileSrc(savedFile.uri),
            }
        } else {

            return {
                filepath: fileName,
                webviewPath: photo.webPath,
            };
        }

    };

    const convertBlobToBase64 = (blob: Blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                resolve(reader.result);
            };
            reader.readAsDataURL(blob);
        });
    };


    return {
        addNewToGallery,
        savePhotoToGallery,
        deletePhotoFromGallery,
        reloadPhotos,
        photos,
    };
}

export interface UserPhoto {
    filepath: string;
    webviewPath?: string;
}