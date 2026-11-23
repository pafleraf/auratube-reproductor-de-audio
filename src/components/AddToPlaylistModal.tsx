import React, { useState } from 'react';
import { FolderPlus, Check, Plus, X, ListMusic } from 'lucide-react';
import { Playlist, Track } from '../types';

interface AddToPlaylistModalProps {
  track: Track | null;
  playlists: Playlist[];
  onClose: () => void;
  onAddTrackToPlaylist: (playlistId: string, track: Track) => void;
  onCreatePlaylistWithTrack: (name: string, description: string, track: Track) => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  track,
  playlists,
  onClose,
  onAddTrackToPlaylist,
  onCreatePlaylistWithTrack,
}) => {
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewForm, setShowNewForm] = useState(playlists.length === 0);

  if (!track) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    onCreatePlaylistWithTrack(trimmed, 'Lista personalizada', track);
    setNewPlaylistName('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#12151E] border border-white/10 p-5 shadow-2xl text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="min-w-0 pr-2">
            <h3 className="text-base font-semibold font-display truncate">
              Guardar en lista de reproducción
            </h3>
            <p className="text-xs text-slate-400 truncate mt-0.5">{track.title}</p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {playlists.length > 0 && (
          <div className="mt-3 max-h-48 overflow-y-auto custom-scroll divide-y divide-white/5">
            {playlists.map((pl) => {
              const alreadyIn = pl.tracks.some((t) => t.videoId === track.videoId);
              return (
                <button
                  key={pl.id}
                  onClick={() => {
                    onAddTrackToPlaylist(pl.id, track);
                    onClose();
                  }}
                  className="w-full min-h-[48px] px-3 py-2.5 flex items-center justify-between text-left hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ListMusic className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{pl.name}</p>
                      <p className="text-xs text-slate-400">
                        {pl.tracks.length} {pl.tracks.length === 1 ? 'pista' : 'pistas'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-amber-400 flex items-center gap-1 shrink-0 ml-2">
                    {alreadyIn ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>En lista</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>Añadir</span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!showNewForm ? (
          <button
            onClick={() => setShowNewForm(true)}
            className="mt-4 w-full min-h-[44px] rounded-xl border border-white/10 hover:border-amber-500/40 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-amber-400" />
            <span>Crear nueva lista de reproducción</span>
          </button>
        ) : (
          <form onSubmit={handleCreate} className="mt-4 pt-3 border-t border-white/10 space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Nombre de la nueva lista
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Ej. Podcasts Nocturnos, Deep Focus..."
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#090A0F] border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="min-h-[44px] px-4 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Crear y Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
