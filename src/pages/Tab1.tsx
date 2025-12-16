import {
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonLoading,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonThumbnail,
  IonTitle,
  IonToolbar,
  useIonToast,
  useIonViewWillEnter,
} from '@ionic/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import {
  decodeHtml,
  type NoteListItem,
  type WpDailyJournal,
  type WpMedia,
  type WpQuickNote,
  wpGet,
} from '../api/wordpress';
import './Tab1.css';

// Notes browsing tab.
//
// This page merges quick notes + daily journals into a single list.
// Thumbnail URLs are resolved from WP media IDs. We also support a
// short-lived client-side override (sessionStorage) so the UI can reflect
// image add/remove immediately even if WP responses are briefly stale.

function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const Tab1: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const [present] = useIonToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NoteListItem[]>([]);

  const getImageOverrides = () => {
    // Per-session image overrides keyed by `${type}-${id}`.
    // Used to avoid stale thumbnails immediately after an edit.
    try {
      const raw = sessionStorage.getItem('noteImageOverrides');
      if (!raw) return {} as Record<string, { imageId: number | null; imageUrl?: string | null }>;
      return JSON.parse(raw) as Record<string, { imageId: number | null; imageUrl?: string | null }>;
    } catch {
      return {} as Record<string, { imageId: number | null; imageUrl?: string | null }>;
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overrides = getImageOverrides();

      const [quickNotes, dailyJournals] = await Promise.all([
        wpGet<WpQuickNote[]>('/wp/v2/quick-note'),
        wpGet<WpDailyJournal[]>('/wp/v2/daily-journal'),
      ]);

      const merged: NoteListItem[] = [
        ...quickNotes.map((n) => ({
          id: n.id,
          type: n.type,
          title: decodeHtml(n.title.rendered ?? ''),
          date: n.date,
          imageId:
            overrides[`${n.type}-${n.id}`]?.imageId === null
              ? undefined
              : (overrides[`${n.type}-${n.id}`]?.imageId ?? (n.acf.note_image ?? undefined)),
        })),
        ...dailyJournals.map((n) => ({
          id: n.id,
          type: n.type,
          title: decodeHtml(n.title.rendered ?? ''),
          date: n.date,
          imageId:
            overrides[`${n.type}-${n.id}`]?.imageId === null
              ? undefined
              : (overrides[`${n.type}-${n.id}`]?.imageId ?? (n.acf.journal_image ?? undefined)),
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const imageIds = Array.from(
        new Set(merged.map((m) => m.imageId).filter((v): v is number => typeof v === 'number'))
      );

      const mediaById = new Map<number, string>();
      await Promise.all(
        imageIds.map(async (mid) => {
          try {
            const media = await wpGet<WpMedia>(`/wp/v2/media/${mid}`);
            // Prefer smaller sizes for the list UI.
            const thumb =
              media.media_details?.sizes?.thumbnail?.source_url ??
              media.media_details?.sizes?.medium?.source_url ??
              media.source_url;
            if (thumb) mediaById.set(mid, thumb);
          } catch {
            // ignore missing media
          }
        })
      );

      setItems(
        merged.map((m) => {
          const override = overrides[`${m.type}-${m.id}`];
          return {
            ...m,
            thumbnailUrl:
              override?.imageId === null
                ? undefined
                : (override?.imageUrl ?? (m.imageId ? mediaById.get(m.imageId) : undefined)),
          };
        })
      );
    } catch (e) {
      present({ message: e instanceof Error ? e.message : String(e), duration: 3000, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [present]);

  useEffect(() => {
    // Initial load on first mount.
    load();
  }, [load]);

  useIonViewWillEnter(() => {
    // Reload whenever the tab becomes active.
    load();
  });

  useEffect(() => {
    // Extra safety: some Ionic navigation flows don't remount Tab1.
    // When we return to /tab1, ensure the list refreshes.
    if (location.pathname === '/tab1') {
      load();
    }
  }, [load, location.pathname]);

  // Any UI-level overrides are handled via sessionStorage and picked up on load()

  const groupedLabel = useMemo(() => {
    return items.length === 1 ? 'note' : 'notes';
  }, [items.length]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{items.length} {groupedLabel}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonLoading isOpen={loading} message="Loading notes..." />

        <IonRefresher
          slot="fixed"
          onIonRefresh={async (e) => {
            await load();
            e.detail.complete();
          }}
        >
          <IonRefresherContent />
        </IonRefresher>

        <IonList>
          {items.map((item) => (
            <IonItem
              key={`${item.type}-${item.id}`}
              button
              onClick={() => history.push(`/tab1/note/${item.type}/${item.id}`)}
            >
              {item.thumbnailUrl ? (
                <IonThumbnail slot="start">
                  <img alt="thumbnail" src={item.thumbnailUrl} />
                </IonThumbnail>
              ) : null}
              <IonLabel>
                <h2>{item.title || '(untitled)'}</h2>
                <p>{formatDisplayDate(item.date)}</p>
              </IonLabel>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonPage>
  );
};

export default Tab1;
