import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User } from 'firebase/auth';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  Trash2,
  Loader2,
  Check,
  LogOut,
  AlertTriangle,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  AuraTubeDriveBackup,
  DRIVE_BACKUP_FILENAME,
  DriveBackupFileMeta,
  deleteBackupFromGoogleDrive,
  disconnectGoogleDrive,
  downloadBackupFromGoogleDrive,
  findDriveBackupFile,
  getGoogleDriveAccessToken,
  hasValidCachedToken,
  signInWithGoogleDrive,
  subscribeToAuthUser,
  uploadBackupToGoogleDrive,
} from '../services/googleDriveSync';
import { HistoryItem, Playlist, SubscribedChannel, Track } from '../types';
import { formatRelativeTime } from '../utils/youtube';

interface GoogleDriveSyncBarProps {
  playlists: Playlist[];
  queue: Track[];
  savedPositions: Record<string, number>;
  subscriptions: SubscribedChannel[];
  history: HistoryItem[];
  onRestoreLibrary: (
    backup: AuraTubeDriveBackup,
    mode: 'merge' | 'replace'
  ) => void;
  onNotify: (msg: string, type?: 'info' | 'error') => void;
  compact?: boolean;
  buttonScale?: 'sm' | 'md' | 'lg';
}

type PendingConfirmation =
  | {
      type: 'upload';
      existingFile: DriveBackupFileMeta | null;
    }
  | {
      type: 'delete';
      existingFile: DriveBackupFileMeta;
    }
  | {
      type: 'restore';
      existingFile: DriveBackupFileMeta;
      downloadedBackup: AuraTubeDriveBackup;
    };

export const GoogleDriveSyncBar: React.FC<GoogleDriveSyncBarProps> = ({
  playlists,
  queue,
  savedPositions,
  subscriptions,
  history,
  onRestoreLibrary,
  onNotify,
  compact = false,
  buttonScale = 'md',
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(hasValidCachedToken());
  const [remoteFile, setRemoteFile] = useState<DriveBackupFileMeta | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [busyLabel, setBusyLabel] = useState<string>('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(
    null
  );

  useEffect(() => {
    const unsub = subscribeToAuthUser((u) => {
      setUser(u);
      setHasToken(hasValidCachedToken());
    });
    return () => unsub();
  }, []);

  const totalSavedTracks = playlists.reduce(
    (acc, pl) => acc + pl.tracks.length,
    0
  );

  const checkRemoteBackup = useCallback(
    async (token: string) => {
      try {
        setBusyLabel('Consultando Drive...');
        setIsBusy(true);
        const found = await findDriveBackupFile(token);
        setRemoteFile(found);
        return found;
      } catch (err) {
        onNotify(
          err instanceof Error
            ? err.message
            : 'No se pudo consultar Google Drive',
          'error'
        );
        return null;
      } finally {
        setIsBusy(false);
        setBusyLabel('');
      }
    },
    [onNotify]
  );

  const handleConnectGoogleDrive = async () => {
    try {
      setIsBusy(true);
      setBusyLabel('Conectando con Google Drive...');
      const { accessToken, user: signedInUser } = await signInWithGoogleDrive();
      setUser(signedInUser);
      setHasToken(true);
      const found = await findDriveBackupFile(accessToken);
      setRemoteFile(found);
      onNotify(
        found
          ? `Conectado a Google Drive. Copia encontrada (${new Date(
              found.modifiedTime
            ).toLocaleDateString('es-ES')})`
          : 'Conectado a Google Drive. Listo para sincronizar tus listas.'
      );
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Cancelado o error al iniciar sesión con Google',
        'error'
      );
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Step 1 before Upload: inspect remote file & open mandatory confirmation modal
  const handlePrepareUpload = async () => {
    try {
      setIsBusy(true);
      setBusyLabel('Verificando Google Drive...');
      const token = await getGoogleDriveAccessToken();
      setHasToken(true);
      const found = await findDriveBackupFile(token);
      setRemoteFile(found);
      setPendingConfirm({
        type: 'upload',
        existingFile: found,
      });
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Google Drive',
        'error'
      );
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Step 2 after user explicitly confirms Upload in modal
  const handleConfirmUpload = async () => {
    if (!pendingConfirm || pendingConfirm.type !== 'upload') return;
    const targetFile = pendingConfirm.existingFile;
    setPendingConfirm(null);

    try {
      setIsBusy(true);
      setBusyLabel('Guardando en Google Drive...');
      const token = await getGoogleDriveAccessToken();
      setHasToken(true);

      const payload: AuraTubeDriveBackup = {
        version: 1,
        updatedAt: Date.now(),
        playlists,
        savedQueue: queue,
        savedPositions,
        subscriptions,
        history: history.slice(0, 60),
      };

      const savedMeta = await uploadBackupToGoogleDrive(
        token,
        payload,
        targetFile?.id
      );
      setRemoteFile(savedMeta);
      onNotify(
        `Sincronizado en Google Drive (${playlists.length} listas y ${queue.length} pistas en cola)`
      );
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Error al guardar en Google Drive',
        'error'
      );
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Step 1 before Restore: download backup preview & ask user confirmation (Merge vs Replace)
  const handlePrepareRestore = async () => {
    try {
      setIsBusy(true);
      setBusyLabel('Buscando copia en Google Drive...');
      const token = await getGoogleDriveAccessToken();
      setHasToken(true);
      const found = await findDriveBackupFile(token);
      setRemoteFile(found);

      if (!found) {
        onNotify(
          'No se encontró ninguna copia guardada en tu Google Drive todavía.',
          'error'
        );
        return;
      }

      setBusyLabel('Leyendo listas desde Google Drive...');
      const downloaded = await downloadBackupFromGoogleDrive(token, found.id);
      setPendingConfirm({
        type: 'restore',
        existingFile: found,
        downloadedBackup: downloaded,
      });
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Error al leer desde Google Drive',
        'error'
      );
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Step 1 before Delete: open mandatory confirmation modal
  const handlePrepareDelete = async () => {
    try {
      setIsBusy(true);
      setBusyLabel('Verificando archivo...');
      const token = await getGoogleDriveAccessToken();
      setHasToken(true);
      const found = remoteFile || (await findDriveBackupFile(token));
      setRemoteFile(found);
      if (!found) {
        onNotify('No hay archivo de sincronización en Google Drive para eliminar.');
        return;
      }
      setPendingConfirm({
        type: 'delete',
        existingFile: found,
      });
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Error al verificar archivo en Google Drive',
        'error'
      );
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  // Step 2 after user explicitly confirms Delete in modal
  const handleConfirmDelete = async () => {
    if (!pendingConfirm || pendingConfirm.type !== 'delete') return;
    const fileToDelete = pendingConfirm.existingFile;
    setPendingConfirm(null);

    try {
      setIsBusy(true);
      setBusyLabel('Eliminando de Google Drive...');
      const token = await getGoogleDriveAccessToken();
      await deleteBackupFromGoogleDrive(token, fileToDelete.id);
      setRemoteFile(null);
      onNotify('Copia eliminada de Google Drive correctamente');
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'No se pudo eliminar el archivo de Google Drive',
        'error'
      );
    } finally {
      setIsBusy(false);
      setBusyLabel('');
    }
  };

  const handleDisconnect = async () => {
    await disconnectGoogleDrive();
    setUser(null);
    setHasToken(false);
    setRemoteFile(null);
    onNotify('Cuenta de Google Drive desconectada');
  };

  const btnHeightClass =
    buttonScale === 'sm'
      ? 'min-h-[30px] px-2 text-[11px]'
      : buttonScale === 'lg'
      ? 'min-h-[42px] px-3.5 text-xs'
      : 'min-h-[36px] px-2.5 text-xs';

  const iconBtnClass =
    buttonScale === 'sm'
      ? 'min-h-[30px] min-w-[30px]'
      : buttonScale === 'lg'
      ? 'min-h-[42px] min-w-[42px]'
      : 'min-h-[36px] min-w-[36px]';

  return (
    <>
      <div
        className={`${
          compact ? 'px-2.5 py-1.5' : 'p-3'
        } rounded-xl bg-[#090A0F] border border-white/10 flex flex-row items-center justify-between gap-2 flex-wrap`}
      >
        <div className="min-w-0 flex items-center gap-2">
          <div
            className={`${
              compact ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl'
            } bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0`}
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-amber-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-white whitespace-nowrap">
                Google Drive
              </span>
              {user && hasToken && (
                <>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span className="text-[11px] text-amber-400 font-medium truncate max-w-[140px]">
                    {user.email || user.displayName}
                  </span>
                </>
              )}
            </div>
            {!compact && (
              <p className="text-[11px] text-slate-400 truncate">
                {isBusy
                  ? busyLabel
                  : remoteFile
                  ? `Última copia: ${formatRelativeTime(
                      new Date(remoteFile.modifiedTime).getTime()
                    )}`
                  : user && hasToken
                  ? `${playlists.length} listas y ${totalSavedTracks} pistas listas`
                  : 'Sincroniza tus listas y pistas guardadas en la nube'}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-1.5 shrink-0">
          {!user || !hasToken ? (
            <button
              type="button"
              onClick={handleConnectGoogleDrive}
              disabled={isBusy}
              className="gsi-material-button"
              title="Conectar con Google Drive para sincronizar listas y pistas"
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  Sign in with Google
                </span>
              </div>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePrepareUpload}
                disabled={isBusy}
                className={`${btnHeightClass} rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer`}
                title="Guardar listas de reproducción y pistas en Google Drive"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>{compact ? 'Guardar' : 'Guardar en Drive'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrepareRestore}
                disabled={isBusy}
                className={`${btnHeightClass} rounded-xl bg-[#12151E] border border-white/10 hover:border-amber-500/40 disabled:opacity-40 text-slate-200 font-medium flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer`}
                title="Restaurar o importar listas y pistas desde Google Drive"
              >
                <CloudDownload className="w-3.5 h-3.5 text-amber-400" />
                <span>Restaurar</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const token = await getGoogleDriveAccessToken();
                  await checkRemoteBackup(token);
                }}
                disabled={isBusy}
                className={`${iconBtnClass} rounded-xl bg-[#12151E] border border-white/10 hover:border-white/25 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer`}
                title="Comprobar estado en Google Drive"
                aria-label="Comprobar estado en Google Drive"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {remoteFile && (
                <button
                  type="button"
                  onClick={handlePrepareDelete}
                  disabled={isBusy}
                  className={`${iconBtnClass} rounded-xl bg-[#12151E] border border-white/10 hover:border-red-500/40 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer`}
                  title="Eliminar copia guardada en Google Drive"
                  aria-label="Eliminar copia en Google Drive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isBusy}
                className={`${iconBtnClass} rounded-xl bg-[#12151E] border border-white/10 hover:border-white/25 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer`}
                title="Desconectar cuenta de Google"
                aria-label="Desconectar cuenta de Google"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Explicit User Confirmation Modal before Mutating / Destructive Google Drive Operations */}
      {pendingConfirm &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            onClick={() => setPendingConfirm(null)}
          >
            <div
              className="w-full max-w-md max-h-[92dvh] overflow-y-auto custom-scroll rounded-2xl bg-[#12151E] border border-white/15 shadow-2xl p-4 sm:p-5 space-y-3.5 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    pendingConfirm.type === 'delete'
                      ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                      : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                  }`}
                >
                  {pendingConfirm.type === 'delete' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : pendingConfirm.type === 'upload' ? (
                    <CloudUpload className="w-5 h-5" />
                  ) : (
                    <CloudDownload className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-white">
                    {pendingConfirm.type === 'upload'
                      ? pendingConfirm.existingFile
                        ? 'Confirmar actualización en Google Drive'
                        : 'Confirmar guardado en Google Drive'
                      : pendingConfirm.type === 'delete'
                      ? 'Confirmar eliminación en Google Drive'
                      : 'Restaurar desde Google Drive'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono-tabular">
                    Archivo: {DRIVE_BACKUP_FILENAME}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pendingConfirm.type === 'upload' && (
              <>
                <div className="p-3.5 rounded-xl bg-[#090A0F] border border-white/10 space-y-2 text-xs text-slate-300">
                  <p>
                    {pendingConfirm.existingFile
                      ? `Se sobrescribirá tu copia anterior en Google Drive (modificada ${formatRelativeTime(
                          new Date(
                            pendingConfirm.existingFile.modifiedTime
                          ).getTime()
                        )}) con los siguientes datos actuales:`
                      : 'Se creará un nuevo archivo de respaldo en tu Google Drive con los siguientes datos:'}
                  </p>
                  <ul className="space-y-1 text-slate-200 font-medium pt-1">
                    <li>
                      · {playlists.length} listas de reproducción ({totalSavedTracks}{' '}
                      pistas guardadas)
                    </li>
                    <li>· {queue.length} pistas en la cola de reproducción actual</li>
                    <li>· {subscriptions.length} canales suscritos</li>
                    <li>
                      · {Math.min(history.length, 60)} pistas en el historial con progreso
                    </li>
                  </ul>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingConfirm(null)}
                    className="min-h-[42px] px-4 rounded-xl bg-[#090A0F] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmUpload}
                    className="min-h-[42px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {pendingConfirm.existingFile
                        ? 'Sobrescribir en Drive'
                        : 'Crear copia en Drive'}
                    </span>
                  </button>
                </div>
              </>
            )}

            {pendingConfirm.type === 'delete' && (
              <>
                <div className="p-3.5 rounded-xl bg-[#090A0F] border border-red-500/20 space-y-1.5 text-xs text-slate-300">
                  <p>
                    ¿Estás seguro de que deseas eliminar permanentemente el archivo{' '}
                    <span className="text-white font-semibold">
                      {pendingConfirm.existingFile.name}
                    </span>{' '}
                    de tu Google Drive?
                  </p>
                  <p className="text-slate-400">
                    Tus listas locales en este dispositivo no se borrarán, pero se eliminará el respaldo en la nube.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingConfirm(null)}
                    className="min-h-[42px] px-4 rounded-xl bg-[#090A0F] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="min-h-[42px] px-4 rounded-xl bg-red-500 hover:bg-red-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar de Google Drive</span>
                  </button>
                </div>
              </>
            )}

            {pendingConfirm.type === 'restore' && (
              <>
                <div className="p-3.5 rounded-xl bg-[#090A0F] border border-white/10 space-y-2 text-xs text-slate-300">
                  <p>
                    Copia encontrada en Google Drive (guardada{' '}
                    {formatRelativeTime(
                      pendingConfirm.downloadedBackup.updatedAt ||
                        new Date(
                          pendingConfirm.existingFile.modifiedTime
                        ).getTime()
                    )}
                    ):
                  </p>
                  <ul className="space-y-1 text-slate-200 font-medium pt-1">
                    <li>
                      · {pendingConfirm.downloadedBackup.playlists.length} listas de
                      reproducción (
                      {pendingConfirm.downloadedBackup.playlists.reduce(
                        (acc, pl) => acc + (pl.tracks?.length || 0),
                        0
                      )}{' '}
                      pistas)
                    </li>
                    <li>
                      · {pendingConfirm.downloadedBackup.savedQueue.length} pistas en
                      cola guardada
                    </li>
                    <li>
                      · {pendingConfirm.downloadedBackup.subscriptions.length} canales
                      suscritos
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingConfirm(null)}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#090A0F] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const data = pendingConfirm.downloadedBackup;
                      setPendingConfirm(null);
                      onRestoreLibrary(data, 'merge');
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[#090A0F] border border-amber-500/40 hover:bg-amber-500/15 text-amber-300 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Combinar con actuales
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const data = pendingConfirm.downloadedBackup;
                      setPendingConfirm(null);
                      onRestoreLibrary(data, 'replace');
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Reemplazar biblioteca
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
