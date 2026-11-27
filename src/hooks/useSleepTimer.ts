import { useState, useEffect, useCallback, RefObject } from 'react';

interface UseSleepTimerParams {
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  setIsPlaying: (playing: boolean) => void;
  notify: (text: string, type?: 'info' | 'error') => void;
}

export function useSleepTimer({
  isPlaying,
  volume,
  isMuted,
  audioRef,
  setIsPlaying,
  notify,
}: UseSleepTimerParams) {
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [sleepOnTrackEnd, setSleepOnTrackEnd] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Sleep Timer countdown & smooth 5-second volume fade-out
  useEffect(() => {
    if (sleepRemainingSec === null || sleepRemainingSec <= 0 || !isPlaying) return;

    const interval = setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          const audio = audioRef.current;
          if (audio) {
            audio.pause();
            audio.volume = isMuted ? 0 : volume;
          }
          setIsPlaying(false);
          notify('Temporizador finalizado: reproducción pausada');
          return null;
        }
        if (prev <= 6 && audioRef.current && !isMuted) {
          audioRef.current.volume = Math.max(0.05, (volume * (prev - 1)) / 5);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepRemainingSec, isPlaying, volume, isMuted, audioRef, setIsPlaying, notify]);

  const handleSelectSleepOption = useCallback(
    (minutes: number | 'track' | 0) => {
      setShowSleepMenu(false);
      if (minutes === 0) {
        setSleepRemainingSec(null);
        setSleepOnTrackEnd(false);
        if (audioRef.current && !isMuted) {
          audioRef.current.volume = volume;
        }
        notify('Temporizador desactivado');
      } else if (minutes === 'track') {
        setSleepRemainingSec(null);
        setSleepOnTrackEnd(true);
        notify('El audio se detendrá al finalizar la pista actual');
      } else {
        setSleepOnTrackEnd(false);
        setSleepRemainingSec(minutes * 60);
        notify(`Apagado automático en ${minutes} minutos`);
      }
    },
    [audioRef, isMuted, volume, notify]
  );

  return {
    sleepRemainingSec,
    setSleepRemainingSec,
    sleepOnTrackEnd,
    setSleepOnTrackEnd,
    showSleepMenu,
    setShowSleepMenu,
    handleSelectSleepOption,
  };
}
