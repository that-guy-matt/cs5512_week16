import { useEffect, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { Photo } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { isPlatform } from '@ionic/react';
import { Capacitor } from '@capacitor/core';

export function usePhotoGallery() {
    const [photos, setPhotos ] = useState<UserPhoto[]>([]);
    const PHOTO_STORAGE = 'photos';

    useEffect(() => {
        reloadPhotos();
    }, []);

    const reloadPhotos = async () => {
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
        // take photo
        const capturedPhoto = await Camera.getPhoto({
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
            quality: 100,
        });

        await savePhotoToGallery(capturedPhoto);
    };

    const savePhotoToGallery = async (photo: Photo) => {
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

    const savePicture = async (photo: Photo, fileName: string): Promise<UserPhoto> => {
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
        reloadPhotos,
        photos,
    };
}

export interface UserPhoto {
    filepath: string;
    webviewPath?: string;
}