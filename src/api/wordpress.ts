// WordPress REST API client + shared types.
//
// This file centralizes:
// - TypeScript types for our WP custom post types (quick-note, daily-journal) and media.
// - Small fetch helpers (GET/POST JSON + media upload) with Basic Auth.
//
// Keeping this logic in one place avoids duplicating auth/header handling across pages.

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
  // API base URL is stored in Vite env; normalize by trimming trailing slashes.
  return getEnv('VITE_WP_API_URL').replace(/\/+$/, '');
}

function getAuthHeader(): string {
  // Basic auth for protected endpoints (POST + media upload).
  // Credentials are pulled from .env and encoded per RFC7617.
  const username = getEnv('VITE_WP_USERNAME');
  const password = getEnv('VITE_WP_PASSWORD');
  const token = btoa(`${username}:${password}`);
  return `Basic ${token}`;
}

async function wpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // Lower-level helper: builds URL, applies headers, and throws on non-2xx.
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
  // Public GET requests (no auth required for our use cases).
  return wpFetch<T>(path, { method: 'GET' });
}

export async function wpPostJson<T>(path: string, body: unknown): Promise<T> {
  // JSON POST requests to WP REST (requires auth).
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
  // Media upload endpoint expects multipart/form-data.
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
