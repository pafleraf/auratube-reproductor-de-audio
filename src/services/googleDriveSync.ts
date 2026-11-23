import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { HistoryItem, Playlist, SubscribedChannel, Track } from '../types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_BACKUP_FILENAME = 'auratube_library_sync.json';

// Strictly in-memory token cache (never stored in localStorage or sessionStorage)
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

export interface DriveBackupFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

export interface AuraTubeDriveBackup {
  version: number;
  updatedAt: number;
  playlists: Playlist[];
  savedQueue: Track[];
  savedPositions: Record<string, number>;
  subscriptions: SubscribedChannel[];
  history: HistoryItem[];
}

export function hasValidCachedToken(): boolean {
  return Boolean(cachedToken && tokenExpiry && Date.now() < tokenExpiry);
}

export async function signInWithGoogleDrive(): Promise<{
  accessToken: string;
  user: User;
}> {
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_FILE_SCOPE);

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);

  if (!credential?.accessToken) {
    throw new Error('No se pudo obtener el token de acceso para Google Drive.');
  }

  cachedToken = credential.accessToken;
  // Cache token in memory for 50 minutes (tokens expire in 60m)
  tokenExpiry = Date.now() + 50 * 60 * 1000;

  return {
    accessToken: cachedToken,
    user: result.user,
  };
}

export async function getGoogleDriveAccessToken(): Promise<string> {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  const { accessToken } = await signInWithGoogleDrive();
  return accessToken;
}

export async function disconnectGoogleDrive(): Promise<void> {
  cachedToken = null;
  tokenExpiry = null;
  await signOut(auth);
}

export function subscribeToAuthUser(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Look up existing AuraTube backup file created by this app in the user's Google Drive.
 * Read-only metadata lookup.
 */
export async function findDriveBackupFile(
  accessToken: string
): Promise<DriveBackupFileMeta | null> {
  const query = encodeURIComponent(
    `name = '${DRIVE_BACKUP_FILENAME}' and trashed = false`
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime%20desc&pageSize=5`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    tokenExpiry = null;
    throw new Error('Tu sesión de Google Drive expiró. Vuelve a conectar tu cuenta.');
  }

  if (!res.ok) {
    throw new Error(`Error al consultar Google Drive (${res.status})`);
  }

  const data = (await res.json()) as { files?: DriveBackupFileMeta[] };
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

/**
 * Upload (create or update) playlists and saved tracks JSON file in Google Drive.
 * Must only be called AFTER explicit user confirmation in the UI.
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  payload: AuraTubeDriveBackup,
  existingFileId?: string
): Promise<DriveBackupFileMeta> {
  const metadata = {
    name: DRIVE_BACKUP_FILENAME,
    mimeType: 'application/json',
    description:
      'Copia sincronizada de listas de reproducción, cola de pistas, canales e historial de AuraTube',
  };

  const boundary = '-------AuraTubeDriveSyncBoundary7MA4YWxkTrZu0gW';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = existingFileId
    ? JSON.stringify({ mimeType: 'application/json' })
    : JSON.stringify(metadata);

  const jsonContent = JSON.stringify(payload, null, 2);

  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    metadataPart +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    jsonContent +
    closeDelimiter;

  const endpoint = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        existingFileId
      )}?uploadType=multipart&fields=id,name,modifiedTime,size`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size';

  const method = existingFileId ? 'PATCH' : 'POST';

  const res = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body: multipartBody,
  });

  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    tokenExpiry = null;
    throw new Error('Permiso expirado en Google Drive. Inicia sesión nuevamente.');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `No se pudo guardar en Google Drive (${res.status}): ${errText.slice(0, 120)}`
    );
  }

  return (await res.json()) as DriveBackupFileMeta;
}

/**
 * Download backup JSON content from Google Drive.
 */
export async function downloadBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<AuraTubeDriveBackup> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    tokenExpiry = null;
    throw new Error('Permiso expirado en Google Drive. Inicia sesión nuevamente.');
  }

  if (!res.ok) {
    throw new Error(`No se pudo descargar la copia de Google Drive (${res.status})`);
  }

  const parsed = (await res.json()) as Partial<AuraTubeDriveBackup>;
  if (!parsed || !Array.isArray(parsed.playlists)) {
    throw new Error('El archivo en Google Drive no contiene un formato válido de AuraTube.');
  }

  return {
    version: parsed.version || 1,
    updatedAt: parsed.updatedAt || Date.now(),
    playlists: parsed.playlists || [],
    savedQueue: Array.isArray(parsed.savedQueue) ? parsed.savedQueue : [],
    savedPositions:
      parsed.savedPositions && typeof parsed.savedPositions === 'object'
        ? parsed.savedPositions
        : {},
    subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
  };
}

/**
 * Delete the backup file from Google Drive.
 * Must only be called AFTER explicit user confirmation in the UI.
 */
export async function deleteBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    cachedToken = null;
    tokenExpiry = null;
    throw new Error('Permiso expirado en Google Drive. Inicia sesión nuevamente.');
  }

  if (!res.ok && res.status !== 204) {
    throw new Error(`No se pudo eliminar el archivo de Google Drive (${res.status})`);
  }
}
