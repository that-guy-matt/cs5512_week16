export type WpPostType = 'quick-note' | 'daily-journal';

export interface WpRenderedText {
  rendered: string;
}

export interface WpQuickNote {
  id: number;
  date: string;
  modified: string;
  type: 'quick-note';
  title: WpRenderedText;
  acf: {
    note_image: number | null;
    image_description: string;
    image_location: string;
    notes_body: string;
  };
}

export interface WpDailyJournal {
  id: number;
  date: string;
  modified: string;
  type: 'daily-journal';
  title: WpRenderedText;
  acf: {
    journal_date: string;
    mood: string;
    journal_image: number | null;
    journal_entry: string;
    journal_prompt: string;
  };
}

export interface WpMedia {
  id: number;
  source_url: string;
  media_details?: {
    sizes?: Record<string, { source_url: string }>;
  };
}

export interface NoteListItem {
  id: number;
  type: WpPostType;
  title: string;
  date: string;
  imageId?: number;
  thumbnailUrl?: string;
}

function getEnv(name: string): string {
  const value = (import.meta as any).env?.[name] as string | undefined;
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getWpApiUrl(): string {
  return getEnv('VITE_WP_API_URL').replace(/\/+$/, '');
}

function getAuthHeader(): string {
  const username = getEnv('VITE_WP_USERNAME');
  const password = getEnv('VITE_WP_PASSWORD');
  const token = btoa(`${username}:${password}`);
  return `Basic ${token}`;
}

async function wpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getWpApiUrl();
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function wpGet<T>(path: string): Promise<T> {
  return wpFetch<T>(path, { method: 'GET' });
}

export async function wpPostJson<T>(path: string, body: unknown): Promise<T> {
  return wpFetch<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  });
}

export async function wpUploadMedia(blob: Blob, filename: string): Promise<WpMedia> {
  const form = new FormData();
  form.append('file', blob, filename);

  return wpFetch<WpMedia>('/wp/v2/media', {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
    },
    body: form,
  });
}

export function decodeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.documentElement.textContent ?? html;
}
