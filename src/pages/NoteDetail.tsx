import {
  IonActionSheet,
  IonAlert,
  IonBackButton,
  IonButton,
  IonButtons,
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
import { useHistory, useParams } from 'react-router-dom';
import {
  type WpDailyJournal,
  type WpMedia,
  type WpPostType,
  type WpQuickNote,
  wpGet,
  wpPostJson,
  wpUploadMedia,
  decodeHtml,
} from '../api/wordpress';
import { usePhotoGallery, type UserPhoto } from '../hooks/usePhotoGallery';

// Note edit page.
//
// This page edits either a Quick Note or Daily Journal. It loads the post from WP,
// allows updating ACF fields, and supports adding/removing an image.
//
// Image UX:
// - Tapping the thumbnail opens an action sheet for capture/upload/gallery pick.
// - X overlay removes the current image (with confirmation).
//
// To avoid stale UI immediately after an edit, we persist a per-session image override
// keyed by `${type}-${id}` and apply it when loading.

type RouteParams = {
  type: WpPostType;
  id: string;
};

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

const NoteDetail: React.FC = () => {
  const { type, id } = useParams<RouteParams>();
  const history = useHistory();
  const [present] = useIonToast();

  const { photos, savePhotoToGallery } = usePhotoGallery();

  const [loading, setLoading] = useState(true);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [imageActionOpen, setImageActionOpen] = useState(false);
  const [removeImageOpen, setRemoveImageOpen] = useState(false);

  const [title, setTitle] = useState('');

  const [imageId, setImageId] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [imageDescription, setImageDescription] = useState('');
  const [imageLocation, setImageLocation] = useState('');
  const [notesBody, setNotesBody] = useState('');

  const [journalDate, setJournalDate] = useState(formatDateForAcf(new Date()));
  const [mood, setMood] = useState<AllowedMood>('Neutral');
  const [journalEntry, setJournalEntry] = useState('');
  const [journalPrompt, setJournalPrompt] = useState('');

  const noteKey = `${type}-${id}`;

  const getImageOverrides = () => {
    try {
      const raw = sessionStorage.getItem('noteImageOverrides');
      if (!raw) return {} as Record<string, { imageId: number | null; imageUrl?: string | null }>;
      return JSON.parse(raw) as Record<string, { imageId: number | null; imageUrl?: string | null }>;
    } catch {
      return {} as Record<string, { imageId: number | null; imageUrl?: string | null }>;
    }
  };

  const setImageOverride = (nextImageId: number | null, nextImageUrl: string | null) => {
    const current = getImageOverrides();
    const updated = { ...current, [noteKey]: { imageId: nextImageId, imageUrl: nextImageUrl } };
    sessionStorage.setItem('noteImageOverrides', JSON.stringify(updated));
  };

  const titleLabel = useMemo(() => {
    if (type === 'daily-journal') return 'Edit Daily Journal';
    return 'Edit Quick Note';
  }, [type]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const override = getImageOverrides()[noteKey];

        if (type === 'quick-note') {
          const post = await wpGet<WpQuickNote>(`/wp/v2/quick-note/${id}`);
          setTitle(decodeHtml(post.title.rendered || ''));
          setImageId(override ? override.imageId : (post.acf.note_image ?? null));
          if (override?.imageId === null) setImageUrl(null);
          else if (override?.imageUrl) setImageUrl(override.imageUrl);
          setImageDescription(post.acf.image_description || '');
          setImageLocation(post.acf.image_location || '');
          setNotesBody(post.acf.notes_body || '');
        } else {
          const post = await wpGet<WpDailyJournal>(`/wp/v2/daily-journal/${id}`);
          setTitle(decodeHtml(post.title.rendered || ''));
          setImageId(override ? override.imageId : (post.acf.journal_image ?? null));
          if (override?.imageId === null) setImageUrl(null);
          else if (override?.imageUrl) setImageUrl(override.imageUrl);
          setJournalDate(post.acf.journal_date || formatDateForAcf(new Date()));
          setMood(sanitizeMood(post.acf.mood));
          setJournalEntry(post.acf.journal_entry || '');
          setJournalPrompt(post.acf.journal_prompt || '');
        }
      } catch (e) {
        present({ message: e instanceof Error ? e.message : String(e), duration: 3000, color: 'danger' });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, present, type]);

  useEffect(() => {
    const loadImage = async () => {
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

    loadImage();
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

  const save = async () => {
    setLoading(true);
    try {
      if (type === 'quick-note') {
        await wpPostJson(`/wp/v2/quick-note/${id}`, {
          title,
          acf: {
            note_image: imageId ?? null,
            image_description: imageDescription,
            image_location: imageLocation,
            notes_body: notesBody,
          },
        });
      } else {
        await wpPostJson(`/wp/v2/daily-journal/${id}`, {
          title,
          acf: {
            journal_date: journalDate,
            mood: sanitizeMood(mood),
            journal_image: imageId ?? null,
            journal_entry: journalEntry,
            journal_prompt: journalPrompt,
          },
        });
      }
      present({ message: 'Saved', duration: 1200, color: 'success' });
      setImageOverride(imageId, imageUrl);
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
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tab1" />
          </IonButtons>
          <IonTitle>{titleLabel}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={save}>Save</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonLoading isOpen={loading} message="Loading..." />

        <IonItem>
          <IonLabel position="stacked">Title</IonLabel>
          <IonInput value={title} placeholder="e.g. Morning reflections" onIonInput={(e) => setTitle(e.detail.value ?? '')} />
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

        {type === 'quick-note' ? (
          <>
            <IonItem>
              <IonLabel position="stacked">Image Description</IonLabel>
              <IonInput
                value={imageDescription}
                placeholder="e.g. Golden hour by the river"
                onIonInput={(e) => setImageDescription(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Where Taken</IonLabel>
              <IonInput
                value={imageLocation}
                placeholder="e.g. Downtown OKC"
                onIonInput={(e) => setImageLocation(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Notes</IonLabel>
              <IonTextarea
                value={notesBody}
                placeholder="Add a few details about the photo or your thoughts..."
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
                placeholder="Write about your day..."
                onIonInput={(e) => setJournalEntry(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Prompt Used</IonLabel>
              <IonTextarea
                value={journalPrompt}
                placeholder="Optional prompt"
                onIonInput={(e) => setJournalPrompt(e.detail.value ?? '')}
              />
            </IonItem>
          </>
        )}

        <IonItem lines="none">
          <IonButton expand="block" onClick={save}>
            Save
          </IonButton>
        </IonItem>
      </IonContent>
    </IonPage>
  );
};

export default NoteDetail;
