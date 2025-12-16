import {
  IonActionSheet,
  IonAlert,
  IonButton,
  IonCol,
  IonContent,
  IonHeader,
  IonImg,
  IonInput,
  IonItem,
  IonLabel,
  IonLoading,
  IonModal,
  IonPage,
  IonRow,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react';
import { Camera, CameraResultType, CameraSource, type Photo } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { isPlatform } from '@ionic/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { type WpMedia, wpGet, wpPostJson, wpUploadMedia } from '../api/wordpress';
import { usePhotoGallery, type UserPhoto } from '../hooks/usePhotoGallery';
import './Tab3.css';

const allowedMoods = ['Happy', 'Calm', 'Neutral', 'Tired', 'Stressed', 'Anxious', 'Excited'] as const;
type AllowedMood = (typeof allowedMoods)[number];

function sanitizeMood(value: unknown): AllowedMood {
  if (typeof value !== 'string') return 'Neutral';
  return (allowedMoods as readonly string[]).includes(value) ? (value as AllowedMood) : 'Neutral';
}

const placeholderImageDataUri =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <rect width="240" height="240" fill="#f3f4f6"/>
      <path d="M60 160l35-45 30 35 20-25 35 35H60z" fill="#cbd5e1"/>
      <circle cx="90" cy="90" r="14" fill="#cbd5e1"/>
    </svg>`
  );

function formatDateForAcf(date: Date): string {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const cleaned = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(cleaned);
  const bytes = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    bytes[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([bytes] as BlobPart[], { type: contentType });
}

async function photoToBlob(photo: Photo): Promise<Blob> {
  if (!isPlatform('hybrid')) {
    const res = await fetch(photo.webPath!);
    return await res.blob();
  }

  const readFile = await Filesystem.readFile({ path: photo.path! });
  return base64ToBlob(readFile.data as string, 'image/jpeg');
}

const Tab3: React.FC = () => {
  const history = useHistory();
  const [present] = useIonToast();

  const { photos, savePhotoToGallery } = usePhotoGallery();

  const [loading, setLoading] = useState(false);
  const [noteType, setNoteType] = useState<'quick-note' | 'daily-journal'>('daily-journal');

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [imageActionOpen, setImageActionOpen] = useState(false);
  const [removeImageOpen, setRemoveImageOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [imageId, setImageId] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // quick-note
  const [imageDescription, setImageDescription] = useState('');
  const [imageLocation, setImageLocation] = useState('');
  const [notesBody, setNotesBody] = useState('');

  // daily-journal
  const [journalDate, setJournalDate] = useState(formatDateForAcf(new Date()));
  const [mood, setMood] = useState<AllowedMood>('Neutral');
  const [journalEntry, setJournalEntry] = useState('');
  const [journalPrompt, setJournalPrompt] = useState('');

  const pageTitle = useMemo(() => {
    return noteType === 'daily-journal' ? 'New Daily Journal' : 'New Quick Note';
  }, [noteType]);

  const setImageOverride = (key: string, nextImageId: number | null, nextImageUrl: string | null) => {
    try {
      const raw = sessionStorage.getItem('noteImageOverrides');
      const current = raw ? (JSON.parse(raw) as Record<string, { imageId: number | null; imageUrl?: string | null }>) : {};
      const updated = { ...current, [key]: { imageId: nextImageId, imageUrl: nextImageUrl } };
      sessionStorage.setItem('noteImageOverrides', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!imageId) {
        setImageUrl(null);
        return;
      }
      try {
        const media = await wpGet<WpMedia>(`/wp/v2/media/${imageId}`);
        const thumb = media.media_details?.sizes?.thumbnail?.source_url;
        setImageUrl(thumb || media.source_url);
      } catch {
        setImageUrl(null);
      }
    };
    load();
  }, [imageId]);

  const pickAndUploadImage = async (source: CameraSource) => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source,
        quality: 85,
      });

      await savePhotoToGallery(photo);

      const blob = await photoToBlob(photo);
      const filename = `${Date.now()}.jpg`;
      const media = await wpUploadMedia(blob, filename);
      setImageId(media.id);
      setImageUrl(media.media_details?.sizes?.thumbnail?.source_url ?? media.source_url);
      present({ message: 'Image uploaded', duration: 1200, color: 'success' });
    } catch (e) {
      present({ message: e instanceof Error ? e.message : String(e), duration: 3000, color: 'danger' });
    }
  };

  const galleryPhotoToBlob = async (photo: UserPhoto): Promise<Blob> => {
    if (!photo.webviewPath) throw new Error('Selected photo is missing a webview path');
    const res = await fetch(photo.webviewPath);
    return await res.blob();
  };

  const pickFromGalleryAndUpload = async (photo: UserPhoto) => {
    setGalleryOpen(false);
    setLoading(true);
    try {
      const blob = await galleryPhotoToBlob(photo);
      const filename = `${Date.now()}.jpg`;
      const media = await wpUploadMedia(blob, filename);
      setImageId(media.id);
      setImageUrl(media.media_details?.sizes?.thumbnail?.source_url ?? media.source_url);
      present({ message: 'Image uploaded', duration: 1200, color: 'success' });
    } catch (e) {
      present({ message: e instanceof Error ? e.message : String(e), duration: 3000, color: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      if (noteType === 'quick-note') {
        const created = await wpPostJson<{ id: number }>('/wp/v2/quick-note', {
          status: 'publish',
          title,
          acf: {
            note_image: imageId ?? null,
            image_description: imageDescription,
            image_location: imageLocation,
            notes_body: notesBody,
          },
        });
        setImageOverride(`quick-note-${created.id}`, imageId, imageUrl);
      } else {
        const created = await wpPostJson<{ id: number }>('/wp/v2/daily-journal', {
          status: 'publish',
          title,
          acf: {
            journal_date: journalDate,
            mood: sanitizeMood(mood),
            journal_image: imageId ?? null,
            journal_entry: journalEntry,
            journal_prompt: journalPrompt,
          },
        });
        setImageOverride(`daily-journal-${created.id}`, imageId, imageUrl);
      }

      present({ message: 'Created', duration: 1200, color: 'success' });
      history.replace('/tab1');
    } catch (e) {
      present({ message: e instanceof Error ? e.message : String(e), duration: 3000, color: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{pageTitle}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonLoading isOpen={loading} message="Saving..." />

        <IonItem>
          <IonLabel position="stacked">Note Type</IonLabel>
          <IonSelect value={noteType} onIonChange={(e) => setNoteType(e.detail.value)}>
            <IonSelectOption value="daily-journal">Daily Journal</IonSelectOption>
            <IonSelectOption value="quick-note">Quick Note</IonSelectOption>
          </IonSelect>
        </IonItem>

        <IonItem>
          <IonLabel position="stacked">Title</IonLabel>
          <IonInput value={title} placeholder="e.g. A walk in the park" onIonInput={(e) => setTitle(e.detail.value ?? '')} />
        </IonItem>

        <IonItem lines="none">
          <IonLabel>Image</IonLabel>
        </IonItem>

        <IonItem lines="none">
          <div
            onClick={() => setImageActionOpen(true)}
            style={{ position: 'relative', width: 120, height: 120, cursor: 'pointer' }}
          >
            <IonImg
              src={imageUrl ?? placeholderImageDataUri}
              style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, overflow: 'hidden' }}
            />
            {imageId && (
              <IonButton
                size="small"
                fill="solid"
                color="medium"
                onClick={(e) => {
                  e.stopPropagation();
                  setRemoveImageOpen(true);
                }}
                style={{ position: 'absolute', top: 6, right: 6, minWidth: 28, height: 28 }}
              >
                X
              </IonButton>
            )}
            {!imageId && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.25)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  textAlign: 'center',
                  padding: 8,
                }}
              >
                Tap to add image
              </div>
            )}
          </div>
        </IonItem>

        <IonAlert
          isOpen={removeImageOpen}
          header="Remove image?"
          message="This will remove the image from this note."
          onDidDismiss={() => setRemoveImageOpen(false)}
          buttons={[
            {
              text: 'Cancel',
              role: 'cancel',
            },
            {
              text: 'Remove',
              role: 'destructive',
              handler: () => {
                setImageId(null);
                setImageUrl(null);
              },
            },
          ]}
        />

        <IonActionSheet
          isOpen={imageActionOpen}
          onDidDismiss={() => setImageActionOpen(false)}
          buttons={[
            {
              text: 'Take Photo',
              handler: () => pickAndUploadImage(CameraSource.Camera),
            },
            {
              text: 'Upload from Photos',
              handler: () => pickAndUploadImage(CameraSource.Photos),
            },
            {
              text: 'Choose from Gallery',
              handler: () => setGalleryOpen(true),
            },
            {
              text: 'Cancel',
              role: 'cancel',
            },
          ]}
        />

        <IonModal isOpen={galleryOpen} onDidDismiss={() => setGalleryOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>Select from Gallery</IonTitle>
              <IonButton slot="end" onClick={() => setGalleryOpen(false)}>
                Close
              </IonButton>
            </IonToolbar>
          </IonHeader>
          <IonContent>
            <IonRow>
              {photos.map((p) => (
                <IonCol size="6" key={p.filepath}>
                  <IonImg src={p.webviewPath} onClick={() => pickFromGalleryAndUpload(p)} />
                </IonCol>
              ))}
            </IonRow>
          </IonContent>
        </IonModal>

        {noteType === 'quick-note' ? (
          <>
            <IonItem>
              <IonLabel position="stacked">Image Description</IonLabel>
              <IonInput
                value={imageDescription}
                placeholder="e.g. Sunset over the lake"
                onIonInput={(e) => setImageDescription(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Where Taken</IonLabel>
              <IonInput
                value={imageLocation}
                placeholder="e.g. Oklahoma City"
                onIonInput={(e) => setImageLocation(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Notes</IonLabel>
              <IonTextarea
                value={notesBody}
                placeholder="Write your note here..."
                onIonInput={(e) => setNotesBody(e.detail.value ?? '')}
              />
            </IonItem>
          </>
        ) : (
          <>
            <IonItem>
              <IonLabel position="stacked">Journal Date (YYYYMMDD)</IonLabel>
              <IonInput
                value={journalDate}
                placeholder="YYYYMMDD"
                onIonInput={(e) => setJournalDate(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Mood</IonLabel>
              <IonSelect value={mood} onIonChange={(e) => setMood(sanitizeMood(e.detail.value))}>
                <IonSelectOption value="Happy">Happy</IonSelectOption>
                <IonSelectOption value="Calm">Calm</IonSelectOption>
                <IonSelectOption value="Neutral">Neutral</IonSelectOption>
                <IonSelectOption value="Tired">Tired</IonSelectOption>
                <IonSelectOption value="Stressed">Stressed</IonSelectOption>
                <IonSelectOption value="Anxious">Anxious</IonSelectOption>
                <IonSelectOption value="Excited">Excited</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Journal Entry</IonLabel>
              <IonTextarea
                value={journalEntry}
                placeholder="What happened today? How did it make you feel?"
                onIonInput={(e) => setJournalEntry(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Prompt Used</IonLabel>
              <IonTextarea
                value={journalPrompt}
                placeholder="Optional: paste the prompt you used"
                onIonInput={(e) => setJournalPrompt(e.detail.value ?? '')}
              />
            </IonItem>
          </>
        )}

        <IonItem lines="none">
          <IonButton expand="block" onClick={submit}>
            Create
          </IonButton>
        </IonItem>
      </IonContent>
    </IonPage>
  );
};

export default Tab3;
