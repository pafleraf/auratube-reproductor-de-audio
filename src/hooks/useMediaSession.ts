import { useEffect, RefObject } from 'react';
import { Track } from '../types';

interface UseMediaSessionParams {
  currentTrack: Track | undefined;
  isPlaying: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  setIsPlaying: (playing: boolean) => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onSeekBySeconds: (delta: number) => void;
  onSeekToAbsolute: (targetSec: number) => void;
}

/**
 * Configures the browser/OS Media Session API for persistent lock-screen
 * and notification bar playback controls on Android and iOS.
 */
export function useMediaSession({
  currentTrack,
  isPlaying,
  audioRef,
  setIsPlaying,
  onPrevTrack,
  onNextTrack,
  onSeekBySeconds,
  onSeekToAbsolute,
}: UseMediaSessionParams) {
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.author,
        album: 'AuraTube Background Audio',
        artwork: [
          { src: currentTrack.thumbnailUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: currentTrack.thumbnailUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: currentTrack.thumbnailUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: currentTrack.thumbnailUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: currentTrack.thumbnailUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: currentTrack.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      });
      navigator.mediaSession.setActionHandler('previoustrack', onPrevTrack);
      navigator.mediaSession.setActionHandler('nexttrack', onNextTrack);
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        onSeekBySeconds(-(details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        onSeekBySeconds(details.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          onSeekToAbsolute(details.seekTime);
        }
      });
    } catch {
      // Ignore unsupported mediaSession actions on older browsers
    }
  }, [
    currentTrack,
    audioRef,
    setIsPlaying,
    onPrevTrack,
    onNextTrack,
    onSeekBySeconds,
    onSeekToAbsolute,
  ]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);
}
