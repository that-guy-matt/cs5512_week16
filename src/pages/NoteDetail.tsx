import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonLoading,
  IonPage,
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
  type WpPostType,
  type WpQuickNote,
  wpGet,
  wpPostJson,
  wpUploadMedia,
  decodeHtml,
} from '../api/wordpress';

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

  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');

  const [imageId, setImageId] = useState<number | null>(null);

  const [imageDescription, setImageDescription] = useState('');
  const [imageLocation, setImageLocation] = useState('');
  const [notesBody, setNotesBody] = useState('');

  const [journalDate, setJournalDate] = useState(formatDateForAcf(new Date()));
  const [mood, setMood] = useState<AllowedMood>('Neutral');
  const [journalEntry, setJournalEntry] = useState('');
  const [journalPrompt, setJournalPrompt] = useState('');

  const titleLabel = useMemo(() => {
    if (type === 'daily-journal') return 'Edit Daily Journal';
    return 'Edit Quick Note';
  }, [type]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (type === 'quick-note') {
          const post = await wpGet<WpQuickNote>(`/wp/v2/quick-note/${id}`);
          setTitle(decodeHtml(post.title.rendered || ''));
          setImageId(post.acf.note_image ?? null);
          setImageDescription(post.acf.image_description || '');
          setImageLocation(post.acf.image_location || '');
          setNotesBody(post.acf.notes_body || '');
        } else {
          const post = await wpGet<WpDailyJournal>(`/wp/v2/daily-journal/${id}`);
          setTitle(decodeHtml(post.title.rendered || ''));
          setImageId(post.acf.journal_image ?? null);
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

  const pickAndUploadImage = async () => {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        quality: 85,
      });
      const blob = await photoToBlob(photo);
      const filename = `${Date.now()}.jpg`;
      const media = await wpUploadMedia(blob, filename);
      setImageId(media.id);
      present({ message: 'Image uploaded', duration: 1200, color: 'success' });
    } catch (e) {
      present({ message: e instanceof Error ? e.message : String(e), duration: 3000, color: 'danger' });
    }
  };

  const save = async () => {
    setLoading(true);
    try {
      if (type === 'quick-note') {
        await wpPostJson(`/wp/v2/quick-note/${id}`, {
          title,
          acf: {
            note_image: imageId,
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
            journal_image: imageId,
            journal_entry: journalEntry,
            journal_prompt: journalPrompt,
          },
        });
      }
      present({ message: 'Saved', duration: 1200, color: 'success' });
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
          <IonInput value={title} onIonInput={(e) => setTitle(e.detail.value ?? '')} />
        </IonItem>

        <IonItem lines="none">
          <IonLabel>Image</IonLabel>
          <IonButton onClick={pickAndUploadImage} slot="end">
            {imageId ? 'Replace' : 'Add'}
          </IonButton>
        </IonItem>

        {type === 'quick-note' ? (
          <>
            <IonItem>
              <IonLabel position="stacked">Image Description</IonLabel>
              <IonInput
                value={imageDescription}
                onIonInput={(e) => setImageDescription(e.detail.value ?? '')}
              />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Where Taken</IonLabel>
              <IonInput value={imageLocation} onIonInput={(e) => setImageLocation(e.detail.value ?? '')} />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Notes</IonLabel>
              <IonTextarea value={notesBody} onIonInput={(e) => setNotesBody(e.detail.value ?? '')} />
            </IonItem>
          </>
        ) : (
          <>
            <IonItem>
              <IonLabel position="stacked">Journal Date (YYYYMMDD)</IonLabel>
              <IonInput value={journalDate} onIonInput={(e) => setJournalDate(e.detail.value ?? '')} />
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
              <IonTextarea value={journalEntry} onIonInput={(e) => setJournalEntry(e.detail.value ?? '')} />
            </IonItem>
            <IonItem>
              <IonLabel position="stacked">Prompt Used</IonLabel>
              <IonTextarea value={journalPrompt} onIonInput={(e) => setJournalPrompt(e.detail.value ?? '')} />
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
