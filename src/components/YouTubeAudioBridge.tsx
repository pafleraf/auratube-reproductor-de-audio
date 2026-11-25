import React, { useEffect, useRef } from 'react';

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo?: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        config: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number; target: YTPlayer }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState?: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubeAudioBridgeProps {
  videoId: string;
  isPlaying: boolean;
  playbackRate: number;
  isMuted: boolean;
  volume: number;
  seekTrigger: { time: number; seq: number } | null;
  onBridgeActiveChange: (active: boolean) => void;
  onTimeProgress: (currentTime: number, duration: number) => void;
  onEnded: () => void;
}

export const YouTubeAudioBridge: React.FC<YouTubeAudioBridgeProps> = ({
  videoId,
  isPlaying,
  playbackRate,
  isMuted,
  volume,
  seekTrigger,
  onBridgeActiveChange,
  onTimeProgress,
  onEnded,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const isReadyRef = useRef(false);

  // desiredVideoIdRef always tracks the latest videoId prop from React state
  const desiredVideoIdRef = useRef(videoId);
  // loadedVideoIdRef tracks the videoId actually loaded/cued inside the YT.Player instance
  const loadedVideoIdRef = useRef('');

  const isPlayingRef = useRef(isPlaying);
  const playbackRateRef = useRef(playbackRate);
  const isMutedRef = useRef(isMuted);
  const volumeRef = useRef(volume);
  const pendingStartSecRef = useRef(0);
  const bridgeActiveRef = useRef(false);

  useEffect(() => {
    desiredVideoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    volumeRef.current = volume;
  }, [isMuted, volume]);

  // Helper to synchronize the YT.Player instance with desiredVideoIdRef & isPlayingRef
  const syncPlayerToDesiredVideo = (p: YTPlayer, forceReload = false) => {
    const targetId = desiredVideoIdRef.current;
    if (!targetId) return;

    const needsVideoSwitch = forceReload || loadedVideoIdRef.current !== targetId;
    if (needsVideoSwitch) {
      const startSec = pendingStartSecRef.current > 0 ? pendingStartSecRef.current : 0;
      pendingStartSecRef.current = 0;
      loadedVideoIdRef.current = targetId;

      try {
        p.pauseVideo();
      } catch {
        // ignore
      }

      try {
        if (isPlayingRef.current) {
          p.loadVideoById({ videoId: targetId, startSeconds: startSec });
        } else {
          p.cueVideoById({ videoId: targetId, startSeconds: startSec });
        }
      } catch {
        // ignore
      }
      return;
    }

    try {
      const state = p.getPlayerState?.();
      if (isPlayingRef.current && state !== 1) {
        p.playVideo();
      } else if (!isPlayingRef.current && state === 1) {
        p.pauseVideo();
      }
    } catch {
      // ignore
    }
  };

  // Load YouTube IFrame API script once
  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const initPlayer = () => {
      if (!containerRef.current || !window.YT?.Player || playerRef.current) return;

      const initialVid = desiredVideoIdRef.current;
      loadedVideoIdRef.current = initialVid;

      playerRef.current = new window.YT.Player(containerRef.current, {
        width: 1,
        height: 1,
        videoId: initialVid,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            isReadyRef.current = true;
            try {
              e.target.setVolume(Math.round(volumeRef.current * 100));
              if (isMutedRef.current) e.target.mute();
              else e.target.unMute();
              e.target.setPlaybackRate(playbackRateRef.current);
            } catch {
              // ignore
            }
            // If user loaded a new video before onReady completed, switch immediately to desiredVideoIdRef
            syncPlayerToDesiredVideo(e.target, loadedVideoIdRef.current !== desiredVideoIdRef.current);
          },
          onStateChange: (e) => {
            // Guard: if the player ever starts playing a stale videoId, switch immediately to desiredVideoIdRef
            if (
              desiredVideoIdRef.current &&
              loadedVideoIdRef.current !== desiredVideoIdRef.current
            ) {
              syncPlayerToDesiredVideo(e.target, true);
              return;
            }

            // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING, 5 = CUED
            if (e.data === 1) {
              if (!isPlayingRef.current) {
                try {
                  e.target.pauseVideo();
                } catch {
                  // ignore
                }
                return;
              }
              bridgeActiveRef.current = true;
              onBridgeActiveChange(true);
              const dur = e.target.getDuration?.() || 0;
              const cur = e.target.getCurrentTime?.() || 0;
              if (dur > 0) {
                onTimeProgress(cur, dur);
              }
            } else if (e.data === 2 || e.data === 5) {
              const dur = e.target.getDuration?.() || 0;
              const cur = e.target.getCurrentTime?.() || 0;
              if (dur > 0) {
                onTimeProgress(cur, dur);
              }
            } else if (e.data === 0) {
              onEnded();
            }
          },
          onError: () => {
            // Embed disabled or restricted for this videoId -> fall back to server HTML5 <audio> stream
            bridgeActiveRef.current = false;
            onBridgeActiveChange(false);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };
    }

    // Poll current time while YT bridge is actively playing
    pollTimer = setInterval(() => {
      const p = playerRef.current;
      if (p && isReadyRef.current && bridgeActiveRef.current && isPlayingRef.current) {
        try {
          if (
            desiredVideoIdRef.current &&
            loadedVideoIdRef.current !== desiredVideoIdRef.current
          ) {
            syncPlayerToDesiredVideo(p, true);
            return;
          }
          const state = p.getPlayerState?.();
          if (state === 1) {
            const cur = p.getCurrentTime?.() || 0;
            const dur = p.getDuration?.() || 0;
            onTimeProgress(cur, dur);
          }
        } catch {
          // ignore
        }
      }
    }, 700);

    // Keep playing when tab visibility changes (background mode on mobile browsers)
    const handleVisibility = () => {
      if (
        document.visibilityState === 'hidden' &&
        isPlayingRef.current &&
        playerRef.current &&
        isReadyRef.current
      ) {
        setTimeout(() => {
          try {
            if (isPlayingRef.current && playerRef.current) {
              syncPlayerToDesiredVideo(playerRef.current, false);
            }
          } catch {
            // ignore
          }
        }, 120);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
      isReadyRef.current = false;
    };
  }, []);

  // React to videoId or isPlaying change
  useEffect(() => {
    desiredVideoIdRef.current = videoId;
    isPlayingRef.current = isPlaying;
    const p = playerRef.current;
    if (!p || !isReadyRef.current || !videoId) return;
    syncPlayerToDesiredVideo(p, false);
  }, [videoId, isPlaying]);

  // React to playbackRate change
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !isReadyRef.current) return;
    try {
      p.setPlaybackRate(playbackRate);
    } catch {
      // ignore
    }
  }, [playbackRate]);

  // React to mute / volume change
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !isReadyRef.current) return;
    try {
      p.setVolume(Math.round(volume * 100));
      if (isMuted) p.mute();
      else p.unMute();
    } catch {
      // ignore
    }
  }, [isMuted, volume]);

  // React to explicit user seek
  useEffect(() => {
    if (!seekTrigger) return;
    pendingStartSecRef.current = seekTrigger.time;
    const p = playerRef.current;
    if (!p || !isReadyRef.current) return;
    try {
      if (loadedVideoIdRef.current !== desiredVideoIdRef.current) {
        syncPlayerToDesiredVideo(p, true);
      } else {
        p.seekTo(seekTrigger.time, true);
      }
    } catch {
      // ignore
    }
  }, [seekTrigger]);

  return (
    <div
      className="fixed bottom-0 right-0 w-px h-px opacity-[0.01] pointer-events-none overflow-hidden -z-10"
      aria-hidden="true"
    >
      <div ref={containerRef} />
    </div>
  );
};
