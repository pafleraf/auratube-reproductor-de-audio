import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Moon,
  Gauge,
  Plus,
  ListMusic,
  History,
  Disc3,
  Trash2,
  ArrowUp,
  ArrowDown,
  ClipboardPaste,
  Loader2,
  FolderPlus,
  Search,
  ExternalLink,
  Check,
  AlertCircle,
  BookmarkPlus,
  Radio,
  RefreshCw,
  UserPlus,
  UserCheck,
  CheckCheck,
  Cloud,
} from 'lucide-react';
import {
  ActiveTab,
  ChannelEpisode,
  HistoryItem,
  Playlist,
  RepeatMode,
  SubscribedChannel,
  Track,
} from './types';
import {
  extractYouTubeIdClient,
  formatDuration,
  formatRelativeTime,
  INITIAL_SUBSCRIBED_CHANNELS,
  INITIAL_SUGGESTED_TRACKS,
  resolveYouTubeChannelFeed,
  resolveYouTubeTrack,
} from './utils/youtube';
import { PWAInstallButton } from './components/PWAInstallButton';
import { TrackArtwork } from './components/TrackArtwork';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { YouTubeAudioBridge } from './components/YouTubeAudioBridge';
import { GoogleDriveSyncBar } from './components/GoogleDriveSyncBar';
import { AuraTubeDriveBackup } from './services/googleDriveSync';

const STORAGE_KEYS = {
  QUEUE: 'auratube_queue_v1',
  CURRENT_INDEX: 'auratube_current_idx_v1',
  PLAYLISTS: 'auratube_playlists_v1',
  HISTORY: 'auratube_history_v1',
  SPEED: 'auratube_speed_v1',
  POSITIONS: 'auratube_positions_v1',
  SUBSCRIPTIONS: 'auratube_subscriptions_v1',
  SEEN_EPISODES: 'auratube_seen_episodes_v1',
  LAST_CONNECTION: 'auratube_last_connection_v1',
  SPLIT_PCT: 'auratube_split_pct_v1',
  BTN_SCALE: 'auratube_btn_scale_v1',
};

type ButtonScale = 'sm' | 'md' | 'lg';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const SLEEP_OPTIONS: Array<{ label: string; minutes: number | 'track' | 0 }> = [
  { label: 'Apagado', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
  { label: 'Fin de pista', minutes: 'track' },
];

export default function App() {
  // Responsive orientation & split-view detection (Phone Landscape + Desktop)
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth > window.innerHeight &&
      (window.innerHeight <= 560 || window.innerWidth < 1024)
    );
  });
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024;
  });

  // Left vs. Right panel width percentage in split mode (30% to 58%)
  const [leftSplitPct, setLeftSplitPct] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SPLIT_PCT);
      const parsed = saved ? parseFloat(saved) : 42;
      return Number.isFinite(parsed) && parsed >= 30 && parsed <= 58 ? parsed : 42;
    } catch {
      return 42;
    }
  });

  // Dimensionable button scale for the right workspace panel ('sm' | 'md' | 'lg')
  const [rightBtnScale, setRightBtnScale] = useState<ButtonScale>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BTN_SCALE) as ButtonScale | null;
      return saved === 'sm' || saved === 'md' || saved === 'lg' ? saved : 'md';
    } catch {
      return 'md';
    }
  });

  const splitContainerRef = useRef<HTMLElement | null>(null);
  const isDraggingSplitRef = useRef<boolean>(false);

  // Navigation & responsive layout state
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (
      typeof window !== 'undefined' &&
      window.innerWidth > window.innerHeight &&
      (window.innerHeight <= 560 || window.innerWidth < 1024)
    ) {
      return 'playlists';
    }
    return 'player';
  });

  useEffect(() => {
    const updateViewportMode = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const mobileLand = w > h && (h <= 560 || w < 1024);
      const desk = w >= 1024 && !mobileLand;
      setIsMobileLandscape(mobileLand);
      setIsDesktop(desk);
      if (mobileLand) {
        setActiveTab((prev) => (prev === 'player' ? 'playlists' : prev));
      }
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    window.addEventListener('orientationchange', updateViewportMode);
    return () => {
      window.removeEventListener('resize', updateViewportMode);
      window.removeEventListener('orientationchange', updateViewportMode);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SPLIT_PCT, String(leftSplitPct));
    } catch {
      // ignore
    }
  }, [leftSplitPct]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.BTN_SCALE, rightBtnScale);
    } catch {
      // ignore
    }
  }, [rightBtnScale]);

  const handleStartDragSplit = useCallback((clientX: number) => {
    isDraggingSplitRef.current = true;
    const onMove = (x: number) => {
      if (!isDraggingSplitRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const rawPct = ((x - rect.left) / rect.width) * 100;
      const clamped = Math.round(Math.min(58, Math.max(30, rawPct)));
      setLeftSplitPct(clamped);
    };
    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    };
    const handleEnd = () => {
      isDraggingSplitRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
    onMove(clientX);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
  }, []);

  const isSplitLayout = isMobileLandscape || isDesktop;
  const rightActiveTab: ActiveTab =
    activeTab === 'player' ? (isMobileLandscape ? 'playlists' : 'queue') : activeTab;

  // Dynamic sizing classes for right panel simplified dimensionable buttons
  const rTabBtnClass =
    rightBtnScale === 'sm'
      ? 'min-h-[28px] px-2 text-[11px] rounded-md'
      : rightBtnScale === 'lg'
      ? 'min-h-[40px] px-3.5 text-xs sm:text-sm rounded-xl'
      : 'min-h-[34px] px-2.5 text-xs rounded-lg';

  const rActionBtnClass =
    rightBtnScale === 'sm'
      ? 'min-h-[30px] px-2 text-[11px] rounded-lg'
      : rightBtnScale === 'lg'
      ? 'min-h-[42px] px-3.5 text-xs sm:text-sm rounded-xl'
      : 'min-h-[36px] px-2.5 text-xs rounded-xl';

  const rIconBtnClass =
    rightBtnScale === 'sm'
      ? 'min-h-[30px] min-w-[30px] rounded-md'
      : rightBtnScale === 'lg'
      ? 'min-h-[44px] min-w-[42px] rounded-xl'
      : 'min-h-[36px] min-w-[36px] rounded-lg';

  const rRowArtworkClass =
    rightBtnScale === 'sm'
      ? 'w-9 h-9 rounded-lg'
      : rightBtnScale === 'lg'
      ? 'w-12 h-12 rounded-xl'
      : 'w-10 h-10 rounded-xl';

  // URL Input state
  const [urlInput, setUrlInput] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'info' | 'error' } | null>(null);

  // Last connection timestamp (captured from previous session before updating)
  const [lastConnectionAt, setLastConnectionAt] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LAST_CONNECTION);
      const parsed = saved ? parseInt(saved, 10) : 0;
      if (parsed > 0) return parsed;
    } catch {
      // fallback
    }
    // Default to 12 hours ago so initial episodes from today appear as new since last connection
    return Date.now() - 12 * 3600 * 1000;
  });

  // Update stored connection timestamp & clear any stale dev service worker that could intercept audio streams
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTION, String(Date.now()));
    } catch {
      // ignore
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const reg of regs) {
            reg.unregister().catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);

  // Subscribed Channels state
  const [subscriptions, setSubscriptions] = useState<SubscribedChannel[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SUBSCRIPTIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return INITIAL_SUBSCRIBED_CHANNELS;
  });

  // Seen Episodes map (videoId -> true) for episodes already played or explicitly marked as seen
  const [seenEpisodes, setSeenEpisodes] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SEEN_EPISODES);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    // Older baseline episodes marked as already seen prior to last connection
    return {
      '5qap5aO4i9A': true,
      DWcJFNfaw9c: true,
    };
  });

  // Channel tab UI states
  const [channelQuery, setChannelQuery] = useState('');
  const [isSubscribingChannel, setIsSubscribingChannel] = useState(false);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');

  // Queue & current track state
  const [queue, setQueue] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.QUEUE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return INITIAL_SUGGESTED_TRACKS;
  });

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
      const parsed = saved ? parseInt(saved, 10) : 0;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  });

  // Playlists state
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      if (saved) return JSON.parse(saved);
    } catch {
      // default
    }
    return [
      {
        id: 'pl-default-focus',
        name: 'Sesiones Deep Focus',
        description: 'Audio continuo para concentración con pantalla apagada',
        createdAt: Date.now() - 86400 * 1000,
        tracks: INITIAL_SUGGESTED_TRACKS.slice(0, 2),
      },
    ];
  });

  // Listening History state
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
      if (saved) return JSON.parse(saved);
    } catch {
      // default
    }
    return [
      {
        id: 'hist-initial-1',
        track: INITIAL_SUGGESTED_TRACKS[0],
        playedAt: Date.now() - 1800 * 1000,
        lastPosition: 45,
      },
    ];
  });

  // Saved playback positions map (videoId -> seconds)
  const [savedPositions, setSavedPositions] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.POSITIONS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Audio Engine State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingStartPosRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isBridgeActive, setIsBridgeActive] = useState(false);
  const [seekTrigger, setSeekTrigger] = useState<{ time: number; seq: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SPEED);
      const num = saved ? parseFloat(saved) : 1;
      return SPEED_OPTIONS.includes(num) ? num : 1;
    } catch {
      return 1;
    }
  });

  // Unregister any stale dev Service Worker that could block /api/youtube/stream Range requests
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const reg of regs) {
            if (reg.active?.scriptURL.includes('dev-sw')) {
              reg.unregister().catch(() => {});
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  // Failsafe to prevent isBuffering from staying stuck
  useEffect(() => {
    if (!isBuffering) return;
    const t = setTimeout(() => setIsBuffering(false), 1200);
    return () => clearTimeout(t);
  }, [isBuffering]);

  // Adjust HTML5 <audio> carrier volume when YouTubeAudioBridge is actively playing real YouTube stream
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.volume = 0;
    } else if (isBridgeActive) {
      // Keep carrier active at near-silent level so OS MediaSession & Android/iOS notification bar stay alive
      audio.volume = 0.01;
    } else {
      audio.volume = volume;
    }
  }, [isBridgeActive, isMuted, volume]);

  // Sleep Timer State
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [sleepOnTrackEnd, setSleepOnTrackEnd] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Playlists & History UI state
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [modalTrackForPlaylist, setModalTrackForPlaylist] = useState<Track | null>(null);

  const currentTrack: Track | undefined = queue[currentIndex] || queue[0];

  // Temporary toast message helper
  const notify = useCallback((text: string, type: 'info' | 'error' = 'info') => {
    setFeedbackMsg({ text, type });
  }, []);

  useEffect(() => {
    if (!feedbackMsg) return;
    const timer = setTimeout(() => setFeedbackMsg(null), 3500);
    return () => clearTimeout(timer);
  }, [feedbackMsg]);

  // Persist states in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    } catch {
      // ignore
    }
  }, [queue]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(currentIndex));
    } catch {
      // ignore
    }
  }, [currentIndex]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
    } catch {
      // ignore
    }
  }, [playlists]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(0, 60)));
    } catch {
      // ignore
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SPEED, String(playbackRate));
    } catch {
      // ignore
    }
  }, [playbackRate]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify(savedPositions));
    } catch {
      // ignore
    }
  }, [savedPositions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SUBSCRIPTIONS, JSON.stringify(subscriptions));
    } catch {
      // ignore
    }
  }, [subscriptions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SEEN_EPISODES, JSON.stringify(seenEpisodes));
    } catch {
      // ignore
    }
  }, [seenEpisodes]);

  // Helper to check if an episode is new since last connection (and not yet played/seen)
  const isEpisodeNew = useCallback(
    (ep: ChannelEpisode): boolean => {
      if (seenEpisodes[ep.videoId]) return false;
      return ep.publishedAt >= lastConnectionAt || !seenEpisodes[ep.videoId];
    },
    [seenEpisodes, lastConnectionAt]
  );

  // Mark a single episode as seen when played
  const markEpisodeSeen = useCallback((videoId: string) => {
    setSeenEpisodes((prev) => {
      if (prev[videoId]) return prev;
      return { ...prev, [videoId]: true };
    });
  }, []);

  // Compute new episode counts per channel and globally
  const newCountByChannel = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const ch of subscriptions) {
      const count = ch.episodes.filter((ep) => isEpisodeNew(ep)).length;
      counts[ch.channelId] = count;
      total += count;
    }
    return { counts, total };
  }, [subscriptions, isEpisodeNew]);

  // Unified chronological episodes list (filtered by selectedChannelFilter)
  const displayedChannelEpisodes = useMemo(() => {
    const all: ChannelEpisode[] = [];
    for (const ch of subscriptions) {
      if (selectedChannelFilter !== 'all' && ch.channelId !== selectedChannelFilter) continue;
      for (const ep of ch.episodes) {
        all.push(ep);
      }
    }
    // Sort so new episodes and most recently published appear first
    return all.sort((a, b) => {
      const aNew = isEpisodeNew(a) ? 1 : 0;
      const bNew = isEpisodeNew(b) ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      return b.publishedAt - a.publishedAt;
    });
  }, [subscriptions, selectedChannelFilter, isEpisodeNew]);

  // Record a track in listening history & mark as seen in channel feed
  const recordHistory = useCallback(
    (track: Track, pos = 0) => {
      markEpisodeSeen(track.videoId);
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.track.videoId !== track.videoId);
        return [
          {
            id: `hist-${track.videoId}-${Date.now()}`,
            track,
            playedAt: Date.now(),
            lastPosition: Math.floor(pos),
          },
          ...filtered,
        ].slice(0, 60);
      });
    },
    [markEpisodeSeen]
  );

  // Track navigation callbacks — calls audio.play() synchronously inside user gesture
  const playTrackAtIndex = useCallback(
    (index: number, autoPlay = true, resumePosition?: number) => {
      if (index < 0 || index >= queue.length) return;
      const targetTrack = queue[index];
      setCurrentIndex(index);
      if (targetTrack) {
        markEpisodeSeen(targetTrack.videoId);
      }
      const audio = audioRef.current;
      if (!audio || !targetTrack) return;

      const streamUrl =
        targetTrack.audioStreamUrl ||
        `/api/youtube/stream?id=${targetTrack.videoId}&duration=${targetTrack.durationSeconds || 240}`;

      const startPos =
        typeof resumePosition === 'number'
          ? resumePosition
          : savedPositions[targetTrack.videoId] || 0;

      pendingStartPosRef.current = startPos;
      setCurrentTime(startPos);
      setDuration(targetTrack.durationSeconds || 240);

      audio.src = streamUrl;
      audio.playbackRate = playbackRate;
      (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;

      if (startPos > 0) {
        setSeekTrigger({ time: startPos, seq: Date.now() });
      }

      if (autoPlay) {
        setIsPlaying(true);
        setIsBuffering(false);
        recordHistory(targetTrack, startPos);
        audio.play().catch(() => {
          // Even if carrier audio is delayed, keep playing state for bridge and retry on canplay
        });
      }
    },
    [queue, playbackRate, savedPositions, recordHistory, markEpisodeSeen]
  );

  // Play a specific Track object immediately (from Channels or History)
  const playSpecificTrack = useCallback(
    (track: Track, resumeSec = 0) => {
      markEpisodeSeen(track.videoId);
      const existingIdx = queue.findIndex((t) => t.videoId === track.videoId);
      if (existingIdx !== -1) {
        playTrackAtIndex(existingIdx, true, resumeSec);
      } else {
        setQueue((prev) => [track, ...prev]);
        setCurrentIndex(0);
        const audio = audioRef.current;
        if (audio) {
          const streamUrl =
            track.audioStreamUrl ||
            `/api/youtube/stream?id=${track.videoId}&duration=${track.durationSeconds || 240}`;
          pendingStartPosRef.current = resumeSec;
          setCurrentTime(resumeSec);
          setDuration(track.durationSeconds || 240);
          audio.src = streamUrl;
          audio.playbackRate = playbackRate;
          setIsPlaying(true);
          setIsBuffering(false);
          recordHistory(track, resumeSec);
          audio.play().catch(() => {});
        }
      }
      notify(`Reproduciendo: ${track.title}`);
    },
    [queue, playTrackAtIndex, markEpisodeSeen, playbackRate, recordHistory, notify]
  );

  const handleNextTrack = useCallback(() => {
    if (queue.length === 0) return;
    if (currentIndex < queue.length - 1) {
      playTrackAtIndex(currentIndex + 1, true, 0);
    } else if (repeatMode === 'all') {
      playTrackAtIndex(0, true, 0);
    } else {
      setIsPlaying(false);
    }
  }, [queue.length, currentIndex, repeatMode, playTrackAtIndex]);

  const handlePrevTrack = useCallback(() => {
    if (currentTime > 4) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setSeekTrigger({ time: 0, seq: Date.now() });
      return;
    }
    if (currentIndex > 0) {
      playTrackAtIndex(currentIndex - 1, true, 0);
    } else if (repeatMode === 'all' && queue.length > 0) {
      playTrackAtIndex(queue.length - 1, true, 0);
    }
  }, [currentTime, currentIndex, repeatMode, queue.length, playTrackAtIndex]);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const expectedUrl =
      currentTrack.audioStreamUrl ||
      `/api/youtube/stream?id=${currentTrack.videoId}&duration=${currentTrack.durationSeconds || 240}`;

    if (!audio.src || !audio.src.includes(currentTrack.videoId)) {
      audio.src = expectedUrl;
      audio.playbackRate = playbackRate;
    }

    if (!isPlaying) {
      setIsPlaying(true);
      setIsBuffering(false);
      recordHistory(currentTrack, currentTime);
      audio.play().catch(() => {});
    } else {
      audio.pause();
      setIsPlaying(false);
      setIsBuffering(false);
    }
  }, [currentTrack, playbackRate, isPlaying, currentTime, recordHistory]);

  const seekBySeconds = useCallback(
    (delta: number) => {
      const maxDur = duration > 0 ? duration : currentTrack?.durationSeconds || 240;
      const nextPos = Math.max(0, Math.min(maxDur, currentTime + delta));
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = nextPos;
        } catch {
          // ignore
        }
      }
      setCurrentTime(nextPos);
      setSeekTrigger({ time: nextPos, seq: Date.now() });
    },
    [duration, currentTrack, currentTime]
  );

  const seekToAbsolute = useCallback((targetSec: number) => {
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = targetSec;
      } catch {
        // ignore
      }
    }
    setCurrentTime(targetSec);
    setSeekTrigger({ time: targetSec, seq: Date.now() });
  }, []);

  // Configure Media Session API for persistent Notification Bar & Lock Screen Controls
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
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevTrack);
      navigator.mediaSession.setActionHandler('nexttrack', handleNextTrack);
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        seekBySeconds(-(details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        seekBySeconds(details.seekOffset || 10);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          seekToAbsolute(details.seekTime);
        }
      });
    } catch {
      // Ignore unsupported mediaSession actions
    }
  }, [currentTrack, handlePrevTrack, handleNextTrack, seekBySeconds, seekToAbsolute]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
    (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  }, [playbackRate]);

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
  }, [sleepRemainingSec, isPlaying, volume, isMuted, notify]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (!audio.src) {
      audio.src =
        currentTrack.audioStreamUrl ||
        `/api/youtube/stream?id=${currentTrack.videoId}&duration=${currentTrack.durationSeconds || 240}`;
      setDuration(currentTrack.durationSeconds || 240);
    }
  }, [currentTrack]);

  // Handle pasting and resolving a YouTube URL
  const handleAddUrl = async (mode: 'play' | 'queue', explicitUrl?: string) => {
    const raw = (explicitUrl ?? urlInput).trim();
    if (!raw) {
      notify('Pega un enlace de YouTube válido primero', 'error');
      return;
    }

    const extractedId = extractYouTubeIdClient(raw);
    if (!extractedId) {
      notify('Formato no reconocido. Usa un enlace de youtube.com o youtu.be', 'error');
      return;
    }

    setIsResolving(true);
    try {
      const resolvedTrack = await resolveYouTubeTrack(raw);
      setUrlInput('');

      setQueue((prev) => {
        const existingIdx = prev.findIndex((t) => t.videoId === resolvedTrack.videoId);
        if (existingIdx !== -1) {
          if (mode === 'play') {
            setTimeout(() => playTrackAtIndex(existingIdx, true, 0), 30);
          } else {
            notify('La pista ya está en la cola de reproducción');
          }
          return prev;
        }
        const updated = mode === 'play' ? [resolvedTrack, ...prev] : [...prev, resolvedTrack];
        if (mode === 'play') {
          setTimeout(() => playTrackAtIndex(0, true, 0), 30);
        } else {
          notify(`Añadido a la cola: ${resolvedTrack.title}`);
        }
        return updated;
      });

      if (mode === 'play') {
        setActiveTab('player');
        notify(`Reproduciendo audio: ${resolvedTrack.title}`);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al extraer el audio', 'error');
    } finally {
      setIsResolving(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setUrlInput(text.trim());
        if (extractYouTubeIdClient(text.trim())) {
          await handleAddUrl('play', text.trim());
        } else {
          notify('Texto pegado. Verifica que sea un enlace de YouTube.', 'error');
        }
      } else {
        notify('El portapapeles está vacío', 'error');
      }
    } catch {
      notify('Pega el enlace directamente en el campo de texto', 'info');
    }
  };

  // Channel Subscription Handlers
  const isCurrentAuthorSubscribed = useMemo(() => {
    if (!currentTrack) return false;
    return subscriptions.some(
      (ch) =>
        ch.name.toLowerCase() === currentTrack.author.toLowerCase() ||
        (currentTrack.channelId && ch.channelId === currentTrack.channelId)
    );
  }, [currentTrack, subscriptions]);

  const handleSubscribeByQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed) {
      notify('Escribe el nombre del canal, @handle o enlace de YouTube', 'error');
      return;
    }

    setIsSubscribingChannel(true);
    try {
      const channelData = await resolveYouTubeChannelFeed(trimmed);
      setSubscriptions((prev) => {
        const exists = prev.some(
          (c) =>
            c.channelId === channelData.channelId ||
            c.name.toLowerCase() === channelData.name.toLowerCase()
        );
        if (exists) {
          notify(`Ya estás suscrito a ${channelData.name}`);
          return prev;
        }
        notify(`Suscrito a ${channelData.name} (${channelData.episodes.length} episodios sincronizados)`);
        return [channelData, ...prev];
      });
      setChannelQuery('');
      setSelectedChannelFilter(channelData.channelId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo suscribir al canal', 'error');
    } finally {
      setIsSubscribingChannel(false);
    }
  };

  const handleToggleSubscribeCurrentTrack = async () => {
    if (!currentTrack) return;
    if (isCurrentAuthorSubscribed) {
      const matched = subscriptions.find(
        (ch) =>
          ch.name.toLowerCase() === currentTrack.author.toLowerCase() ||
          (currentTrack.channelId && ch.channelId === currentTrack.channelId)
      );
      if (matched) {
        setSelectedChannelFilter(matched.channelId);
        setActiveTab('channels');
      }
      return;
    }
    await handleSubscribeByQuery(currentTrack.author);
  };

  const handleUnsubscribeChannel = (channelId: string, name: string) => {
    setSubscriptions((prev) => prev.filter((c) => c.channelId !== channelId));
    if (selectedChannelFilter === channelId) {
      setSelectedChannelFilter('all');
    }
    notify(`Suscripción a ${name} cancelada`);
  };

  const handleMarkAllEpisodesAsSeen = () => {
    const updated: Record<string, boolean> = { ...seenEpisodes };
    for (const ch of subscriptions) {
      if (selectedChannelFilter !== 'all' && ch.channelId !== selectedChannelFilter) continue;
      for (const ep of ch.episodes) {
        updated[ep.videoId] = true;
      }
    }
    setSeenEpisodes(updated);
    setLastConnectionAt(Date.now());
    notify('Todos los episodios marcados como vistos');
  };

  const handleRefreshChannelsFeed = async () => {
    if (subscriptions.length === 0) return;
    setIsRefreshingFeed(true);
    try {
      const refreshed: SubscribedChannel[] = [];
      for (const ch of subscriptions) {
        try {
          const latest = await resolveYouTubeChannelFeed(ch.handle || ch.name);
          // Merge episodes preserving existing and detecting any new items
          const existingIds = new Set(ch.episodes.map((e) => e.videoId));
          const mergedEpisodes = [...ch.episodes];
          for (const ep of latest.episodes) {
            if (!existingIds.has(ep.videoId)) {
              mergedEpisodes.unshift({
                ...ep,
                publishedAt: Date.now(),
              });
            }
          }
          refreshed.push({
            ...ch,
            lastCheckedAt: Date.now(),
            episodes: mergedEpisodes,
          });
        } catch {
          refreshed.push(ch);
        }
      }
      setSubscriptions(refreshed);
      notify('Feed de canales actualizado con éxito');
    } finally {
      setIsRefreshingFeed(false);
    }
  };

  // Queue Management Handlers
  const moveQueueTrack = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= queue.length) return;

    setQueue((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIdx, 0, moved);
      return copy;
    });

    if (currentIndex === index) {
      setCurrentIndex(targetIdx);
    } else if (currentIndex === targetIdx) {
      setCurrentIndex(index);
    }
  };

  const removeQueueTrack = (index: number) => {
    if (queue.length <= 1) {
      notify('La cola debe mantener al menos una pista activa', 'error');
      return;
    }
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
    if (index < currentIndex) {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    } else if (index === currentIndex) {
      playTrackAtIndex(Math.min(index, queue.length - 2), isPlaying, 0);
    }
  };

  const saveQueueAsPlaylist = () => {
    if (queue.length === 0) return;
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name: `Cola guardada (${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })})`,
      description: `${queue.length} pistas de audio`,
      createdAt: Date.now(),
      tracks: [...queue],
    };
    setPlaylists((prev) => [newPl, ...prev]);
    setSelectedPlaylistId(newPl.id);
    setActiveTab('playlists');
    notify(`Cola guardada como lista "${newPl.name}"`);
  };

  // Playlist Management Handlers
  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistTitle.trim();
    if (!trimmed) return;
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name: trimmed,
      description: 'Lista personalizada',
      createdAt: Date.now(),
      tracks: [],
    };
    setPlaylists((prev) => [newPl, ...prev]);
    setNewPlaylistTitle('');
    setSelectedPlaylistId(newPl.id);
    notify(`Lista "${trimmed}" creada`);
  };

  const handleAddTrackToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.tracks.some((t) => t.videoId === track.videoId)) {
          notify(`"${track.title}" ya está en ${pl.name}`);
          return pl;
        }
        notify(`Añadido a ${pl.name}`);
        return { ...pl, tracks: [...pl.tracks, track] };
      })
    );
  };

  const handleCreatePlaylistWithTrack = (name: string, description: string, track: Track) => {
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      description,
      createdAt: Date.now(),
      tracks: [track],
    };
    setPlaylists((prev) => [newPl, ...prev]);
    notify(`Lista "${name}" creada con 1 pista`);
  };

  const handlePlayEntirePlaylist = (pl: Playlist, startIndex = 0) => {
    if (pl.tracks.length === 0) {
      notify('Esta lista aún no tiene pistas', 'error');
      return;
    }
    setQueue([...pl.tracks]);
    setCurrentIndex(startIndex);
    setActiveTab('player');
    setTimeout(() => {
      const audio = audioRef.current;
      const target = pl.tracks[startIndex];
      if (audio && target) {
        audio.src =
          target.audioStreamUrl ||
          `/api/youtube/stream?id=${target.videoId}&duration=${target.durationSeconds || 240}`;
        audio.playbackRate = playbackRate;
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            recordHistory(target, 0);
          })
          .catch(() => {});
      }
    }, 30);
    notify(`Reproduciendo lista: ${pl.name}`);
  };

  const handleDeletePlaylist = (id: string) => {
    setPlaylists((prev) => prev.filter((pl) => pl.id !== id));
    if (selectedPlaylistId === id) setSelectedPlaylistId(null);
    notify('Lista eliminada');
  };

  const handleRemoveTrackFromPlaylist = (playlistId: string, videoId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? { ...pl, tracks: pl.tracks.filter((t) => t.videoId !== videoId) }
          : pl
      )
    );
  };

  // Restore or merge library (playlists, queue, positions, subscriptions, history) from Google Drive
  const handleRestoreFromGoogleDrive = useCallback(
    (backup: AuraTubeDriveBackup, mode: 'merge' | 'replace') => {
      if (mode === 'replace') {
        if (backup.playlists.length > 0) {
          setPlaylists(backup.playlists);
          setSelectedPlaylistId(backup.playlists[0].id);
        }
        if (backup.savedQueue.length > 0) {
          setQueue(backup.savedQueue);
          setCurrentIndex(0);
        }
        if (backup.savedPositions) {
          setSavedPositions(backup.savedPositions);
        }
        if (backup.subscriptions.length > 0) {
          setSubscriptions(backup.subscriptions);
        }
        if (backup.history.length > 0) {
          setHistory(backup.history);
        }
        notify(
          `Biblioteca restaurada desde Google Drive (${backup.playlists.length} listas y ${backup.savedQueue.length} pistas)`
        );
        return;
      }

      // Merge mode
      setPlaylists((prev) => {
        const merged = [...prev];
        for (const remotePl of backup.playlists) {
          const existingIdx = merged.findIndex(
            (p) =>
              p.id === remotePl.id ||
              p.name.toLowerCase() === remotePl.name.toLowerCase()
          );
          if (existingIdx === -1) {
            merged.push(remotePl);
          } else {
            const currentTracks = merged[existingIdx].tracks;
            const seenIds = new Set(currentTracks.map((t) => t.videoId));
            const newTracks = (remotePl.tracks || []).filter(
              (t) => !seenIds.has(t.videoId)
            );
            merged[existingIdx] = {
              ...merged[existingIdx],
              tracks: [...currentTracks, ...newTracks],
            };
          }
        }
        return merged;
      });

      if (backup.savedQueue.length > 0) {
        setQueue((prev) => {
          const existingIds = new Set(prev.map((t) => t.videoId));
          const toAdd = backup.savedQueue.filter((t) => !existingIds.has(t.videoId));
          return [...prev, ...toAdd];
        });
      }

      if (backup.savedPositions) {
        setSavedPositions((prev) => ({
          ...backup.savedPositions,
          ...prev,
        }));
      }

      if (backup.subscriptions.length > 0) {
        setSubscriptions((prev) => {
          const existingIds = new Set(prev.map((s) => s.channelId));
          const toAdd = backup.subscriptions.filter(
            (s) => !existingIds.has(s.channelId)
          );
          return [...prev, ...toAdd];
        });
      }

      notify(
        `Sincronización combinada desde Google Drive (${backup.playlists.length} listas procesadas)`
      );
    },
    [notify]
  );

  // Sleep Timer Handler
  const handleSelectSleepOption = (minutes: number | 'track' | 0) => {
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
  };

  const effectiveDuration = duration > 0 ? duration : currentTrack?.durationSeconds || 240;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  const filteredHistory = history.filter(
    (item) =>
      item.track.title.toLowerCase().includes(historySearch.toLowerCase()) ||
      item.track.author.toLowerCase().includes(historySearch.toLowerCase())
  );

  const activePlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) || playlists[0] || null;

  return (
    <div className="h-[100dvh] w-full bg-[#090A0F] text-[#F1F5F9] flex flex-col overflow-hidden select-none">
      {/* Synchronized Client-Side YouTube Audio Bridge for 100% Real YouTube Audio */}
      {currentTrack && (
        <YouTubeAudioBridge
          videoId={currentTrack.videoId}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          isMuted={isMuted}
          volume={
            sleepRemainingSec !== null && sleepRemainingSec <= 5
              ? Math.max(0.05, (volume * sleepRemainingSec) / 5)
              : volume
          }
          seekTrigger={seekTrigger}
          onBridgeActiveChange={(active) => setIsBridgeActive(active)}
          onTimeProgress={(cur, dur) => {
            setIsBuffering(false);
            setCurrentTime(cur);
            if (dur > 0 && Number.isFinite(dur)) {
              setDuration(dur);
            }
          }}
          onEnded={() => {
            if (sleepOnTrackEnd) {
              setSleepOnTrackEnd(false);
              setIsPlaying(false);
              audioRef.current?.pause();
              notify('Temporizador: reproducción detenida al finalizar la pista');
              return;
            }
            if (repeatMode === 'one') {
              seekToAbsolute(0);
              return;
            }
            handleNextTrack();
          }}
        />
      )}

      {/* Native HTML5 Audio Element for Persistent Background Playback & OS MediaSession */}
      <audio
        ref={audioRef}
        preload="auto"
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => setIsBuffering(false)}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setIsBuffering(false);
          if (!isBridgeActive) {
            if (Number.isFinite(el.duration) && el.duration > 0) {
              setDuration(el.duration);
            } else if (currentTrack?.durationSeconds) {
              setDuration(currentTrack.durationSeconds);
            }
          }
          if (pendingStartPosRef.current > 0) {
            try {
              el.currentTime = pendingStartPosRef.current;
            } catch {
              // ignore
            }
            pendingStartPosRef.current = 0;
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setIsBuffering(false);
          const now = isBridgeActive ? currentTime : el.currentTime;
          if (!isBridgeActive) {
            setCurrentTime(now);
          }

          if (currentTrack && Math.floor(now) % 4 === 0 && now > 2) {
            setSavedPositions((prev) => ({
              ...prev,
              [currentTrack.videoId]: Math.floor(now),
            }));
          }

          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            const dur = effectiveDuration;
            if (dur > 0 && now <= dur) {
              try {
                navigator.mediaSession.setPositionState({
                  duration: dur,
                  playbackRate: playbackRate || 1,
                  position: now,
                });
              } catch {
                // ignore invalid position state
              }
            }
          }
        }}
        onEnded={() => {
          if (isBridgeActive) {
            // Loop the silent carrier while the real YouTube stream continues if longer than 180s
            if (isPlaying && audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
            return;
          }
          if (sleepOnTrackEnd) {
            setSleepOnTrackEnd(false);
            setIsPlaying(false);
            notify('Temporizador: reproducción detenida al finalizar la pista');
            return;
          }
          if (repeatMode === 'one' && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
            return;
          }
          handleNextTrack();
        }}
      />

      {/* Top Navigation & Instant YouTube Link Bar — Unified Single Bar in Mobile Landscape */}
      <header
        className={`${
          isMobileLandscape ? 'h-11 px-2.5 gap-2' : 'h-14 px-3 sm:px-6 gap-3 sm:gap-6'
        } border-b border-white/[0.07] bg-[#090A0F]/95 backdrop-blur-md flex items-center justify-between shrink-0 z-30`}
      >
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#player"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab(isMobileLandscape ? 'playlists' : 'player');
          }}
          className={`${
            isMobileLandscape ? 'text-sm' : 'text-base sm:text-lg'
          } font-bold font-display tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-1.5`}
        >
          <Disc3
            className={`${isMobileLandscape ? 'w-4 h-4' : 'w-5 h-5'} text-amber-500 ${
              isPlaying ? 'animate-spin' : ''
            }`}
            style={{ animationDuration: '6s' }}
          />
          <span>AuraTube</span>
        </a>

        {/* In Mobile Landscape: Unified Inline YouTube URL Bar inside Header to save vertical height */}
        {isMobileLandscape ? (
          <div className="flex-1 max-w-xl flex items-center gap-1.5 min-w-0">
            <div className="relative flex-1 flex items-center min-w-0">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddUrl('play');
                  }
                }}
                placeholder="Pegar enlace YouTube..."
                className="w-full h-8 pl-2.5 pr-7 rounded-lg bg-[#12151E] border border-white/10 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                disabled={isResolving}
              />
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="absolute right-0.5 h-7 w-7 flex items-center justify-center text-slate-400 hover:text-amber-400 rounded-md cursor-pointer"
                title="Pegar del portapapeles"
                aria-label="Pegar del portapapeles"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleAddUrl('play')}
              disabled={isResolving}
              className="h-8 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1 shrink-0 cursor-pointer"
              title="Reproducir enlace"
            >
              {isResolving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Play</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddUrl('queue')}
              disabled={isResolving}
              className="h-8 w-8 rounded-lg bg-[#12151E] border border-white/10 hover:border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 cursor-pointer"
              title="Añadir a la cola"
              aria-label="Añadir a la cola"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Desktop Single-Line Navigation Links (5 links) */
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              onClick={() => setActiveTab('player')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeTab === 'player' ? 'text-white border-b-2 border-amber-500' : ''
              }`}
            >
              Reproductor
            </button>
            <button
              onClick={() => setActiveTab('queue')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeTab === 'queue' ? 'text-white border-b-2 border-amber-500' : ''
              }`}
            >
              Cola ({queue.length})
            </button>
            <button
              onClick={() => setActiveTab('channels')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeTab === 'channels'
                  ? 'text-white border-b-2 border-amber-500'
                  : newCountByChannel.total > 0
                  ? 'text-amber-400'
                  : ''
              }`}
            >
              Canales {newCountByChannel.total > 0 ? `(${newCountByChannel.total} nuevos)` : ''}
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeTab === 'playlists' ? 'text-white border-b-2 border-amber-500' : ''
              }`}
            >
              Listas ({playlists.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeTab === 'history' ? 'text-white border-b-2 border-amber-500' : ''
              }`}
            >
              Historial
            </button>
          </nav>
        )}

        {/* Zone 3: Quick Split-Ratio Presets (in Split Layout) + PWA Action */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSplitLayout && (
            <div
              className="flex items-center bg-[#12151E] border border-white/10 rounded-lg p-0.5 text-[10px] font-mono-tabular"
              title="Ajustar proporción de ancho: Reproductor (Izquierda) / Listas (Derecha)"
            >
              {[
                { label: '35/65', pct: 36 },
                { label: '42/58', pct: 42 },
                { label: '50/50', pct: 50 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setLeftSplitPct(preset.pct)}
                  className={`px-1.5 py-1 rounded-md transition-colors cursor-pointer ${
                    Math.abs(leftSplitPct - preset.pct) <= 3
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          <PWAInstallButton />
        </div>
      </header>

      {/* Compact YouTube URL Paste Bar (Hidden in Mobile Landscape because it is unified in the top header) */}
      {!isMobileLandscape && (
        <section className="px-3 sm:px-6 py-2.5 bg-[#12151E]/80 border-b border-white/[0.06] shrink-0 z-20">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
            <div className="relative flex-1 flex items-center">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddUrl('play');
                  }
                }}
                placeholder="Pega enlace de YouTube (watch, youtu.be, shorts, live)..."
                className="w-full min-h-[44px] pl-3.5 pr-10 rounded-xl bg-[#090A0F] border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                disabled={isResolving}
              />
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="absolute right-1 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-amber-400 rounded-lg transition-colors cursor-pointer"
                title="Pegar enlace del portapapeles y reproducir"
                aria-label="Pegar del portapapeles"
              >
                <ClipboardPaste className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleAddUrl('play')}
              disabled={isResolving}
              className="min-h-[44px] px-3.5 sm:px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isResolving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>Escuchar</span>
            </button>

            <button
              type="button"
              onClick={() => handleAddUrl('queue')}
              disabled={isResolving}
              className="min-h-[44px] px-3 rounded-xl bg-[#090A0F] border border-white/10 hover:border-amber-500/40 text-slate-200 font-medium text-xs sm:text-sm flex items-center gap-1 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              title="Añadir enlace al final de la cola"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">A la cola</span>
            </button>
          </div>
        </section>
      )}

      {/* Non-intrusive Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`fixed ${
            isMobileLandscape ? 'top-12' : 'top-28'
          } left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] pointer-events-none`}
        >
          <div
            className={`px-4 py-2 rounded-xl border shadow-xl backdrop-blur-md text-xs font-medium flex items-center gap-2 ${
              feedbackMsg.type === 'error'
                ? 'bg-red-950/90 border-red-500/40 text-red-200'
                : 'bg-[#12151E]/95 border-amber-500/40 text-slate-100'
            }`}
          >
            {feedbackMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="truncate">{feedbackMsg.text}</span>
          </div>
        </div>
      )}

      {/* Main Content Area — Dual-Column Split in Mobile Landscape & Desktop */}
      <main
        ref={splitContainerRef}
        className={`flex-1 min-h-0 max-w-7xl w-full mx-auto ${
          isMobileLandscape ? 'px-2 py-1.5 gap-1.5' : 'px-3 sm:px-6 py-2 sm:py-4 gap-3 sm:gap-4'
        } overflow-hidden flex ${isSplitLayout ? 'flex-row items-stretch' : 'flex-col'}`}
      >
        {/* LEFT COLUMN: PLAYER CONTROLS (Always fixed on Left in Mobile Landscape & Desktop) */}
        <section
          style={isSplitLayout ? { width: `${leftSplitPct}%` } : undefined}
          className={`relative h-full min-h-0 shrink-0 flex flex-col justify-between bg-[#12151E] border border-white/[0.08] rounded-2xl ${
            isMobileLandscape ? 'p-2.5' : 'p-3.5 sm:p-5'
          } overflow-hidden ${isSplitLayout || activeTab === 'player' ? 'flex' : 'hidden'}`}
        >
          {/* Ambient Blurred Video Thumbnail Aura Behind Player */}
          {currentTrack?.thumbnailUrl && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-8 z-0 opacity-20 blur-3xl transition-opacity duration-700"
              style={{
                backgroundImage: `url(${currentTrack.thumbnailUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          )}

          {/* Top Status Row: Clean Unboxed Metadata */}
          <div className="relative z-10 flex items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-400 shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-amber-400 font-medium">Audio Puro</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">
                {isMobileLandscape ? '2º Plano' : 'Media Session Activa'}
              </span>
              {sleepRemainingSec !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300 font-mono-tabular">
                    {formatDuration(sleepRemainingSec)}
                  </span>
                </>
              )}
              {sleepOnTrackEnd && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300">Fin pista</span>
                </>
              )}
            </div>

            {currentTrack && (
              <button
                onClick={() => setModalTrackForPlaylist(currentTrack)}
                className={`${
                  isMobileLandscape ? 'min-h-[28px] px-2 text-[11px]' : 'min-h-[34px] px-2.5 text-xs'
                } rounded-lg hover:bg-white/10 text-slate-200 hover:text-amber-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                title="Guardar pista actual en una lista"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>Guardar</span>
              </button>
            )}
          </div>

          {/* Center Prominent Video Thumbnail Showcase, Track Title & 1-Tap Channel Subscribe Action */}
          {isMobileLandscape ? (
            /* Mobile Landscape Prominent Widescreen Hero Stage */
            <div className="relative z-10 flex-1 min-h-[78px] my-1.5 w-full rounded-xl overflow-hidden border border-white/15 shadow-2xl group bg-[#090A0F] flex flex-col justify-end">
              <TrackArtwork
                src={currentTrack?.thumbnailUrl || ''}
                videoId={currentTrack?.videoId}
                variant="hero"
                alt={currentTrack?.title || 'Miniatura del video'}
                isPlaying={isPlaying}
                className=" !absolute inset-0 w-full h-full rounded-none border-0"
              />

              {/* Top-right quick badge over prominent landscape thumbnail */}
              {currentTrack && (
                <div className="relative z-20 flex items-center justify-between gap-1.5 px-2.5 pt-2 mb-auto">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#090A0F]/80 backdrop-blur-md border border-white/10 text-[10px] font-medium text-amber-300">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isPlaying ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    {isPlaying ? 'Reproduciendo' : 'En pausa'}
                  </span>

                  <a
                    href={currentTrack.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#090A0F]/80 backdrop-blur-md border border-white/10 text-[10px] text-slate-200 hover:text-amber-300 transition-colors"
                    title="Abrir video en YouTube"
                  >
                    <span>YouTube</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}

              {/* Bottom high-contrast metadata overlay bar on landscape hero thumbnail */}
              <div className="relative z-20 w-full px-2.5 pb-2 pt-5 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/85 to-transparent flex items-end justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xs sm:text-sm font-bold font-display text-white truncate leading-tight drop-shadow">
                    {currentTrack ? currentTrack.title : 'Pega un enlace de YouTube'}
                  </h1>
                  <p className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
                    {currentTrack ? currentTrack.author : 'Sin pista activa'}
                  </p>
                </div>

                {currentTrack && (
                  <button
                    onClick={handleToggleSubscribeCurrentTrack}
                    disabled={isSubscribingChannel}
                    className={`min-h-[26px] px-2.5 py-0.5 rounded-lg border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-md ${
                      isCurrentAuthorSubscribed
                        ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                        : 'bg-[#090A0F]/90 border-white/15 text-slate-100 hover:border-amber-500/50'
                    }`}
                  >
                    {isCurrentAuthorSubscribed ? (
                      <>
                        <UserCheck className="w-3 h-3 text-amber-400" />
                        <span>Suscrito</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3 h-3 text-amber-400" />
                        <span>Suscribir</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Portrait & Desktop Prominent 16:9 Widescreen Video Thumbnail Showcase */
            <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center my-1.5 sm:my-2 text-center overflow-hidden">
              <div className="relative w-full max-w-[480px] aspect-video max-h-[32dvh] sm:max-h-[38dvh] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] ring-1 ring-white/15 overflow-hidden group">
                <TrackArtwork
                  src={currentTrack?.thumbnailUrl || ''}
                  videoId={currentTrack?.videoId}
                  variant="hero"
                  alt={currentTrack?.title || 'Miniatura del video'}
                  isPlaying={isPlaying}
                  className="w-full h-full rounded-2xl border-0"
                />

                {/* Subtle status & external link overlay on the prominent video frame */}
                {currentTrack && (
                  <div className="absolute top-2.5 inset-x-2.5 z-30 flex items-center justify-between gap-2 pointer-events-none">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#090A0F]/80 backdrop-blur-md border border-white/15 text-[11px] font-medium text-amber-300 shadow-lg">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isPlaying ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'
                        }`}
                      />
                      <span>{isPlaying ? 'En reproducción' : 'En pausa'}</span>
                    </span>

                    <a
                      href={currentTrack.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#090A0F]/80 hover:bg-[#090A0F] backdrop-blur-md border border-white/15 text-[11px] font-medium text-slate-200 hover:text-amber-300 transition-colors shadow-lg"
                      title="Abrir video original en YouTube"
                    >
                      <span>YouTube</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Duration badge on bottom-right corner of the video thumbnail */}
                {currentTrack && effectiveDuration > 0 && (
                  <div className="absolute bottom-2.5 right-2.5 z-30 pointer-events-none">
                    <span className="px-2 py-0.5 rounded-md bg-[#090A0F]/85 backdrop-blur-md border border-white/15 text-[11px] font-mono-tabular font-semibold text-slate-100 shadow-md">
                      {formatDuration(effectiveDuration)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2.5 sm:mt-3.5 w-full max-w-lg px-1">
                <h1 className="text-base sm:text-xl font-bold font-display text-white line-clamp-2 leading-snug">
                  {currentTrack ? currentTrack.title : 'Pega un enlace de YouTube'}
                </h1>

                <div className="mt-1.5 flex items-center justify-center flex-wrap gap-2 text-xs sm:text-sm text-slate-400">
                  <span className="truncate max-w-[200px] sm:max-w-[260px] font-medium text-slate-200">
                    {currentTrack ? currentTrack.author : 'Sin pista activa'}
                  </span>

                  {currentTrack && (
                    <button
                      onClick={handleToggleSubscribeCurrentTrack}
                      disabled={isSubscribingChannel}
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isCurrentAuthorSubscribed
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                          : 'bg-[#090A0F] border-white/10 text-slate-200 hover:border-amber-500/50 hover:text-amber-400'
                      }`}
                      title={
                        isCurrentAuthorSubscribed
                          ? 'Ver episodios del canal suscrito'
                          : 'Suscribirse a este canal para recibir nuevos episodios'
                      }
                    >
                      {isCurrentAuthorSubscribed ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                          <span>Suscrito</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                          <span>Suscribirse</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Scrubber & Time Telemetry (Tabular Numerals) */}
          <div className="relative z-10 w-full space-y-1 shrink-0">
            <div className="relative flex items-center">
              <div
                className="absolute left-0 h-1.5 bg-amber-500 rounded-l-full pointer-events-none"
                style={{ width: `${progressPercent}%` }}
              />
              <input
                type="range"
                min={0}
                max={effectiveDuration}
                step={1}
                value={Math.min(currentTime, effectiveDuration)}
                onChange={(e) => seekToAbsolute(parseFloat(e.target.value))}
                className={`w-full ${
                  isMobileLandscape ? 'h-5' : 'h-6'
                } audio-scrubber bg-white/10 rounded-full`}
                aria-label="Posición de reproducción"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400 font-mono-tabular">
              <span>{formatDuration(currentTime)}</span>
              <span>
                {isBuffering
                  ? 'Cargando...'
                  : `-${formatDuration(Math.max(0, effectiveDuration - currentTime))}`}
              </span>
              <span>{formatDuration(effectiveDuration)}</span>
            </div>
          </div>

          {/* Primary Transport Controls */}
          <div
            className={`relative z-10 ${
              isMobileLandscape ? 'mt-1' : 'mt-2 sm:mt-3'
            } flex items-center justify-between gap-1 shrink-0`}
          >
            <button
              onClick={() => seekBySeconds(-10)}
              className={`${
                isMobileLandscape ? 'min-h-[36px] min-w-[36px]' : 'min-h-[44px] min-w-[44px]'
              } rounded-xl text-slate-300 hover:text-white hover:bg-white/5 flex flex-col items-center justify-center transition-colors cursor-pointer`}
              title="Retroceder 10 segundos"
              aria-label="Retroceder 10 segundos"
            >
              <RotateCcw className={isMobileLandscape ? 'w-4 h-4' : 'w-5 h-5'} />
              <span className="text-[9px] font-mono-tabular text-slate-400">-10s</span>
            </button>

            <button
              onClick={handlePrevTrack}
              className={`${
                isMobileLandscape ? 'min-h-[38px] min-w-[38px]' : 'min-h-[48px] min-w-[48px]'
              } rounded-xl text-slate-200 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
              title="Pista anterior"
              aria-label="Pista anterior"
            >
              <SkipBack className={isMobileLandscape ? 'w-5 h-5' : 'w-6 h-6'} />
            </button>

            <button
              onClick={togglePlayPause}
              className={`${
                isMobileLandscape ? 'h-11 w-11 rounded-xl' : 'h-14 w-14 sm:h-16 sm:w-16 rounded-2xl'
              } bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center justify-center active:scale-95 transition-all cursor-pointer`}
              title={isPlaying ? 'Pausar' : 'Reproducir en segundo plano'}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isBuffering ? (
                <Loader2 className={`${isMobileLandscape ? 'w-5 h-5' : 'w-7 h-7'} animate-spin`} />
              ) : isPlaying ? (
                <Pause className={`${isMobileLandscape ? 'w-5 h-5' : 'w-7 h-7'} fill-current`} />
              ) : (
                <Play
                  className={`${isMobileLandscape ? 'w-5 h-5' : 'w-7 h-7'} fill-current ml-0.5`}
                />
              )}
            </button>

            <button
              onClick={handleNextTrack}
              className={`${
                isMobileLandscape ? 'min-h-[38px] min-w-[38px]' : 'min-h-[48px] min-w-[48px]'
              } rounded-xl text-slate-200 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
              title="Siguiente pista"
              aria-label="Siguiente pista"
            >
              <SkipForward className={isMobileLandscape ? 'w-5 h-5' : 'w-6 h-6'} />
            </button>

            <button
              onClick={() => seekBySeconds(10)}
              className={`${
                isMobileLandscape ? 'min-h-[36px] min-w-[36px]' : 'min-h-[44px] min-w-[44px]'
              } rounded-xl text-slate-300 hover:text-white hover:bg-white/5 flex flex-col items-center justify-center transition-colors cursor-pointer`}
              title="Adelantar 10 segundos"
              aria-label="Adelantar 10 segundos"
            >
              <RotateCw className={isMobileLandscape ? 'w-4 h-4' : 'w-5 h-5'} />
              <span className="text-[9px] font-mono-tabular text-slate-400">+10s</span>
            </button>
          </div>

          {/* Secondary Studio Utility Bar: Speed (0.5x-2x), Sleep Timer, Repeat & Volume */}
          <div
            className={`${
              isMobileLandscape ? 'mt-1.5 pt-1.5' : 'mt-3 pt-2.5'
            } border-t border-white/[0.07] flex items-center justify-between gap-1.5 shrink-0 relative`}
          >
            {/* Playback Speed Control */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeedMenu((prev) => !prev);
                  setShowSleepMenu(false);
                }}
                className={`${
                  isMobileLandscape ? 'min-h-[32px] px-2 text-[11px]' : 'min-h-[44px] px-3 text-xs'
                } rounded-xl border font-mono-tabular font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                  playbackRate !== 1
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-[#090A0F] border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Velocidad de reproducción"
              >
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                <span>{playbackRate}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-11 left-0 z-40 w-44 rounded-2xl bg-[#090A0F] border border-white/15 p-2 shadow-2xl">
                  <p className="px-2 py-1 text-[11px] font-medium text-slate-400">
                    Velocidad de audio
                  </p>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        onClick={() => {
                          setPlaybackRate(rate);
                          setShowSpeedMenu(false);
                          notify(`Velocidad ajustada a ${rate}x`);
                        }}
                        className={`min-h-[34px] rounded-xl text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                          playbackRate === rate
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sleep Timer Control */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSleepMenu((prev) => !prev);
                  setShowSpeedMenu(false);
                }}
                className={`${
                  isMobileLandscape ? 'min-h-[32px] px-2 text-[11px]' : 'min-h-[44px] px-3 text-xs'
                } rounded-xl border font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                  sleepRemainingSec !== null || sleepOnTrackEnd
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-[#090A0F] border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Temporizador de apagado automático (Sleep Timer)"
              >
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono-tabular">
                  {sleepRemainingSec !== null
                    ? formatDuration(sleepRemainingSec)
                    : sleepOnTrackEnd
                    ? 'Fin'
                    : 'Timer'}
                </span>
              </button>

              {showSleepMenu && (
                <div className="absolute bottom-11 left-1/2 -translate-x-1/2 z-40 w-44 rounded-2xl bg-[#090A0F] border border-white/15 p-2 shadow-2xl">
                  <p className="px-2 py-1 text-[11px] font-medium text-slate-400">
                    Apagado automático
                  </p>
                  <div className="space-y-1 mt-1">
                    {SLEEP_OPTIONS.map((opt) => {
                      const isActive =
                        (opt.minutes === 0 && sleepRemainingSec === null && !sleepOnTrackEnd) ||
                        (opt.minutes === 'track' && sleepOnTrackEnd);
                      return (
                        <button
                          key={opt.label}
                          onClick={() => handleSelectSleepOption(opt.minutes)}
                          className={`w-full min-h-[34px] px-2.5 rounded-xl text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isActive && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Repeat Mode Toggle */}
            <button
              onClick={() => {
                const next: RepeatMode =
                  repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
                setRepeatMode(next);
                notify(
                  next === 'off'
                    ? 'Repetición desactivada'
                    : next === 'all'
                    ? 'Repetir toda la cola'
                    : 'Repetir pista actual'
                );
              }}
              className={`${
                isMobileLandscape
                  ? 'min-h-[32px] min-w-[32px] px-2'
                  : 'min-h-[44px] min-w-[44px] px-2.5'
              } rounded-xl border text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                repeatMode !== 'off'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#090A0F] border-white/10 text-slate-300 hover:text-white'
              }`}
              title="Modo de repetición"
              aria-label="Modo de repetición"
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Repeat className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Mute / Volume Toggle */}
            <button
              onClick={() => {
                const nextMute = !isMuted;
                setIsMuted(nextMute);
                if (audioRef.current) {
                  audioRef.current.muted = nextMute;
                }
              }}
              className={`${
                isMobileLandscape ? 'min-h-[32px] min-w-[32px]' : 'min-h-[44px] min-w-[44px]'
              } rounded-xl bg-[#090A0F] border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer`}
              title={isMuted ? 'Activar sonido' : 'Silenciar'}
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </section>

        {/* Interactive Resizable Divider between Left Player and Right Playlists/Options */}
        {isSplitLayout && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              handleStartDragSplit(e.clientX);
            }}
            onTouchStart={(e) => {
              if (e.touches[0]) {
                handleStartDragSplit(e.touches[0].clientX);
              }
            }}
            className="w-2.5 -mx-1 shrink-0 flex flex-col items-center justify-center cursor-col-resize group select-none z-20"
            title="Arrastra para redimensionar el espacio entre reproductor (izquierda) y listas (derecha)"
            role="separator"
            aria-orientation="vertical"
          >
            <div className="w-1 h-12 rounded-full bg-white/15 group-hover:bg-amber-500/70 group-active:bg-amber-400 transition-colors" />
          </div>
        )}

        {/* RIGHT COLUMN: PLAYLISTS & SIMPLIFIED RESIZABLE OPTIONS */}
        <section
          className={`flex-1 min-w-0 h-full min-h-0 flex flex-col bg-[#12151E] border border-white/[0.07] rounded-2xl overflow-hidden ${
            !isSplitLayout && activeTab === 'player' ? 'hidden' : 'flex'
          }`}
        >
          {/* Sub-Header Switcher inside Right Panel with Simplified Tabs & Button Size Control (S / M / L) */}
          <div
            className={`${
              isMobileLandscape ? 'px-2.5 py-1.5' : 'px-3 sm:px-5 py-2.5'
            } border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0 overflow-x-auto custom-scroll`}
          >
            <div className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-xl border border-white/5 shrink-0">
              <button
                onClick={() => setActiveTab('playlists')}
                className={`${rTabBtnClass} font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                  rightActiveTab === 'playlists'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Listas ({playlists.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('queue')}
                className={`${rTabBtnClass} font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                  rightActiveTab === 'queue'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>Cola ({queue.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('channels')}
                className={`${rTabBtnClass} font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                  rightActiveTab === 'channels'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                    : newCountByChannel.total > 0
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>
                  Canales{' '}
                  {newCountByChannel.total > 0
                    ? `(${newCountByChannel.total})`
                    : `(${subscriptions.length})`}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`${rTabBtnClass} font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                  rightActiveTab === 'history'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Historial</span>
              </button>
            </div>

            {/* Right Controls: Dimensionable Button Size Selector (S/M/L) + Contextual Action */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div
                className="flex items-center bg-[#090A0F] border border-white/10 rounded-lg p-0.5 text-[10px] font-mono-tabular"
                title="Redimensionar botones de opciones y listas (Compacto / Estándar / Grande)"
              >
                {(
                  [
                    { id: 'sm', label: 'S' },
                    { id: 'md', label: 'M' },
                    { id: 'lg', label: 'L' },
                  ] as const
                ).map((sz) => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setRightBtnScale(sz.id)}
                    className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                      rightBtnScale === sz.id
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>

              {rightActiveTab === 'queue' && queue.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setActiveTab('playlists')}
                    className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 font-medium text-slate-300 hover:text-amber-300 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                    title="Sincronizar listas y pistas con Google Drive"
                  >
                    <Cloud className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Drive</span>
                  </button>
                  <button
                    onClick={saveQueueAsPlaylist}
                    className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 font-medium text-slate-200 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                    title="Guardar cola actual como lista"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Guardar</span>
                  </button>
                </div>
              )}

              {rightActiveTab === 'channels' && newCountByChannel.total > 0 && (
                <button
                  onClick={handleMarkAllEpisodesAsSeen}
                  className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 font-medium text-amber-400 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                  title="Marcar todos los episodios nuevos como vistos"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Vistos</span>
                </button>
              )}

              {rightActiveTab === 'history' && history.length > 0 && (
                <button
                  onClick={() => {
                    setHistory([]);
                    notify('Historial de escucha borrado');
                  }}
                  className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-red-500/40 font-medium text-slate-300 hover:text-red-300 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: INTERACTIVE QUEUE WITH REORDERING */}
          {rightActiveTab === 'queue' && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2.5 sm:p-4 divide-y divide-white/[0.05]">
              {queue.map((track, idx) => {
                const isCurrent = idx === currentIndex;
                const savedPos = savedPositions[track.videoId] || 0;
                return (
                  <div
                    key={`${track.videoId}-${idx}`}
                    className={`${
                      rightBtnScale === 'sm' ? 'py-1.5 px-2' : 'py-2 px-2.5'
                    } rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                      isCurrent ? 'bg-amber-500/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <button
                      onClick={() => playTrackAtIndex(idx, true)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <TrackArtwork
                        src={track.thumbnailUrl}
                        alt={track.title}
                        isPlaying={isCurrent && isPlaying}
                        className={rRowArtworkClass}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`${
                            rightBtnScale === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'
                          } font-medium truncate ${
                            isCurrent ? 'text-amber-400 font-semibold' : 'text-slate-100'
                          }`}
                        >
                          {track.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 truncate font-mono-tabular">
                          <span className="font-sans truncate">{track.author}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDuration(track.durationSeconds)}</span>
                          {savedPos > 5 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-300/90">
                                {formatDuration(savedPos)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => setModalTrackForPlaylist(track)}
                        className={`${rIconBtnClass} text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Añadir a lista"
                        aria-label="Añadir a lista"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveQueueTrack(idx, 'up')}
                        disabled={idx === 0}
                        className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Subir en la cola"
                        aria-label="Subir en la cola"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveQueueTrack(idx, 'down')}
                        disabled={idx === queue.length - 1}
                        className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Bajar en la cola"
                        aria-label="Bajar en la cola"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeQueueTrack(idx)}
                        className={`${rIconBtnClass} text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Quitar de la cola"
                        aria-label="Quitar de la cola"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: SUBSCRIBED CHANNELS & NEW EPISODES SINCE LAST CONNECTION */}
          {rightActiveTab === 'channels' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* Top Subscribe Bar (by Channel Name, @handle, or URL) + Refresh Feed */}
              <div
                className={`${
                  isMobileLandscape ? 'p-2 space-y-2' : 'p-3 sm:p-4 space-y-2.5'
                } border-b border-white/[0.06] shrink-0`}
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubscribeByQuery(channelQuery);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <div className="relative flex-1 flex items-center">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      value={channelQuery}
                      onChange={(e) => setChannelQuery(e.target.value)}
                      placeholder="Buscar canal, @handle o URL..."
                      className={`w-full ${
                        rightBtnScale === 'sm' ? 'min-h-[32px] text-xs' : 'min-h-[38px] text-xs sm:text-sm'
                      } pl-8 pr-3 rounded-xl bg-[#090A0F] border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500`}
                      disabled={isSubscribingChannel}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubscribingChannel || !channelQuery.trim()}
                    className={`${rActionBtnClass} bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                  >
                    {isSubscribingChannel ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    <span>Suscribir</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshChannelsFeed}
                    disabled={isRefreshingFeed || subscriptions.length === 0}
                    className={`${rIconBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 text-slate-300 hover:text-white flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer`}
                    title="Comprobar nuevos episodios en todos los canales"
                    aria-label="Actualizar feed de canales"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isRefreshingFeed ? 'animate-spin text-amber-400' : ''
                      }`}
                    />
                  </button>
                </form>

                {/* Horizontal Channel Filter Selector (Unified View Top + Filter by Channel) */}
                {subscriptions.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-0.5">
                    <button
                      onClick={() => setSelectedChannelFilter('all')}
                      className={`${rActionBtnClass} font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedChannelFilter === 'all'
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-[#090A0F] border border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      <span>Todos</span>
                      <span className="font-mono-tabular opacity-80">
                        ({newCountByChannel.total})
                      </span>
                    </button>

                    {subscriptions.map((ch) => {
                      const isSelected = selectedChannelFilter === ch.channelId;
                      const chNewCount = newCountByChannel.counts[ch.channelId] || 0;
                      return (
                        <button
                          key={ch.channelId}
                          onClick={() => setSelectedChannelFilter(ch.channelId)}
                          className={`${rActionBtnClass} font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'bg-[#090A0F] border border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <span>{ch.name}</span>
                          {chNewCount > 0 && (
                            <span
                              className={`font-mono-tabular font-semibold ${
                                isSelected ? 'text-slate-950' : 'text-amber-400'
                              }`}
                            >
                              ({chNewCount})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active Channel Header if a specific channel is filtered */}
              {selectedChannelFilter !== 'all' && (
                <div className="px-3 py-1.5 bg-[#090A0F]/60 border-b border-white/[0.05] flex items-center justify-between gap-2 shrink-0">
                  {(() => {
                    const ch = subscriptions.find((c) => c.channelId === selectedChannelFilter);
                    if (!ch) return null;
                    return (
                      <>
                        <div className="min-w-0 flex items-center gap-1.5 text-xs text-slate-300">
                          <span className="font-semibold text-white truncate">{ch.name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400 truncate">{ch.handle}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-slate-400">
                            {ch.episodes.length} ep.
                          </span>
                        </div>
                        <button
                          onClick={() => handleUnsubscribeChannel(ch.channelId, ch.name)}
                          className={`${rActionBtnClass} text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Dejar</span>
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Unified Chronological Episodes Feed */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2.5 sm:p-4 divide-y divide-white/[0.05]">
                {displayedChannelEpisodes.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                    <Radio className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs sm:text-sm font-medium text-slate-300">
                      Sin canales suscritos todavía
                    </p>
                  </div>
                ) : (
                  displayedChannelEpisodes.map((ep) => {
                    const isNew = isEpisodeNew(ep);
                    const isCurrentlyPlaying =
                      currentTrack?.videoId === ep.videoId && isPlaying;

                    return (
                      <div
                        key={`${ep.channelId}-${ep.videoId}`}
                        className={`${
                          rightBtnScale === 'sm' ? 'py-1.5 px-2' : 'py-2 px-2.5'
                        } rounded-xl flex items-center justify-between gap-2.5 transition-colors ${
                          isNew
                            ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1]'
                            : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <button
                          onClick={() => playSpecificTrack(ep, 0)}
                          className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                        >
                          <TrackArtwork
                            src={ep.thumbnailUrl}
                            alt={ep.title}
                            isPlaying={isCurrentlyPlaying}
                            className={rRowArtworkClass}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`${
                                rightBtnScale === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'
                              } truncate ${
                                isNew
                                  ? 'font-semibold text-white'
                                  : 'font-medium text-slate-200'
                              }`}
                            >
                              {ep.title}
                            </p>
                            {/* Zero-Pill Metadata with clean unboxed NUEVO indicator */}
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 truncate font-mono-tabular">
                              {isNew && (
                                <>
                                  <span className="font-sans font-bold text-amber-400 tracking-wide">
                                    NUEVO
                                  </span>
                                  <span aria-hidden="true" className="text-amber-400">
                                    ·
                                  </span>
                                </>
                              )}
                              <span className="font-sans text-slate-300 truncate">
                                {ep.channelName}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{formatDuration(ep.durationSeconds)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans">{formatRelativeTime(ep.publishedAt)}</span>
                            </div>
                          </div>
                        </button>

                        {/* Episode Quick Actions */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => {
                              markEpisodeSeen(ep.videoId);
                              setQueue((prev) => {
                                if (prev.some((t) => t.videoId === ep.videoId)) {
                                  notify('El episodio ya está en la cola');
                                  return prev;
                                }
                                notify(`Añadido a la cola: ${ep.title}`);
                                return [...prev, ep];
                              });
                            }}
                            className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Añadir episodio a la cola"
                            aria-label="Añadir episodio a la cola"
                          >
                            <Plus className="w-3.5 h-3.5 text-amber-400" />
                          </button>

                          <button
                            onClick={() => setModalTrackForPlaylist(ep)}
                            className={`${rIconBtnClass} text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Guardar episodio en lista"
                            aria-label="Guardar episodio en lista"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM PLAYLISTS & GOOGLE DRIVE SYNC */}
          {rightActiveTab === 'playlists' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div
                className={`${
                  isMobileLandscape ? 'p-2 space-y-1.5' : 'p-3 sm:p-4 space-y-2.5'
                } border-b border-white/[0.06] shrink-0`}
              >
                <GoogleDriveSyncBar
                  playlists={playlists}
                  queue={queue}
                  savedPositions={savedPositions}
                  subscriptions={subscriptions}
                  history={history}
                  onRestoreLibrary={handleRestoreFromGoogleDrive}
                  onNotify={notify}
                  compact={isMobileLandscape}
                  buttonScale={rightBtnScale}
                />

                <form onSubmit={handleCreatePlaylist} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newPlaylistTitle}
                    onChange={(e) => setNewPlaylistTitle(e.target.value)}
                    placeholder="Nueva lista de reproducción..."
                    className={`flex-1 ${
                      rightBtnScale === 'sm' ? 'min-h-[30px] text-xs' : 'min-h-[36px] text-xs sm:text-sm'
                    } px-3 rounded-xl bg-[#090A0F] border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500`}
                  />
                  <button
                    type="submit"
                    disabled={!newPlaylistTitle.trim()}
                    className={`${rActionBtnClass} bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear</span>
                  </button>
                </form>

                {playlists.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scroll pb-0.5">
                    {playlists.map((pl) => {
                      const isSelected = activePlaylist?.id === pl.id;
                      return (
                        <button
                          key={pl.id}
                          onClick={() => setSelectedPlaylistId(pl.id)}
                          className={`${rActionBtnClass} font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'bg-[#090A0F] border border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <span>{pl.name}</span>
                          <span className="font-mono-tabular opacity-75">({pl.tracks.length})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2.5 sm:p-4">
                {!activePlaylist ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                    <ListMusic className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs sm:text-sm font-medium text-slate-300">
                      No tienes listas creadas
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-semibold font-display text-white truncate">
                          {activePlaylist.name}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-mono-tabular">
                          {activePlaylist.tracks.length}{' '}
                          {activePlaylist.tracks.length === 1 ? 'pista' : 'pistas'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {currentTrack && (
                          <button
                            onClick={() =>
                              handleAddTrackToPlaylist(activePlaylist.id, currentTrack)
                            }
                            className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 font-medium text-slate-200 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                            title="Añadir la pista que está sonando a esta lista"
                          >
                            <Plus className="w-3.5 h-3.5 text-amber-400" />
                            <span>+ Actual</span>
                          </button>
                        )}
                        <button
                          onClick={() => handlePlayEntirePlaylist(activePlaylist, 0)}
                          disabled={activePlaylist.tracks.length === 0}
                          className={`${rActionBtnClass} bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Reproducir</span>
                        </button>
                        <button
                          onClick={() => handleDeletePlaylist(activePlaylist.id)}
                          className={`${rIconBtnClass} bg-[#090A0F] border border-white/10 hover:border-red-500/40 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer`}
                          title="Eliminar lista"
                          aria-label="Eliminar lista"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {activePlaylist.tracks.length === 0 ? (
                      <div className="py-6 text-center text-slate-400">
                        <p className="text-xs">
                          Lista vacía. Pulsa &ldquo;+ Actual&rdquo; para guardar la pista en reproducción.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.05]">
                        {activePlaylist.tracks.map((track, idx) => (
                          <div
                            key={`${track.videoId}-${idx}`}
                            className={`${
                              rightBtnScale === 'sm' ? 'py-1.5 px-1.5' : 'py-2 px-2'
                            } flex items-center justify-between gap-2.5 hover:bg-white/[0.03] rounded-xl transition-colors`}
                          >
                            <button
                              onClick={() => handlePlayEntirePlaylist(activePlaylist, idx)}
                              className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                            >
                              <TrackArtwork
                                src={track.thumbnailUrl}
                                alt={track.title}
                                className={rRowArtworkClass}
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`${
                                    rightBtnScale === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'
                                  } font-medium text-slate-100 truncate`}
                                >
                                  {track.title}
                                </p>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono-tabular">
                                  <span className="font-sans truncate">{track.author}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatDuration(track.durationSeconds)}</span>
                                </div>
                              </div>
                            </button>
                            <button
                              onClick={() =>
                                handleRemoveTrackFromPlaylist(activePlaylist.id, track.videoId)
                              }
                              className={`${rIconBtnClass} text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer`}
                              title="Quitar de la lista"
                              aria-label="Quitar de la lista"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: LISTENING HISTORY */}
          {rightActiveTab === 'history' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div
                className={`${
                  isMobileLandscape ? 'p-2' : 'p-3 sm:p-4'
                } border-b border-white/[0.06] shrink-0`}
              >
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Filtrar historial por título o canal..."
                    className={`w-full ${
                      rightBtnScale === 'sm' ? 'min-h-[32px] text-xs' : 'min-h-[38px] text-xs sm:text-sm'
                    } pl-8 pr-3 rounded-xl bg-[#090A0F] border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500`}
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2.5 sm:p-4 divide-y divide-white/[0.05]">
                {filteredHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                    <History className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs sm:text-sm font-medium text-slate-300">
                      Sin historial de escucha
                    </p>
                  </div>
                ) : (
                  filteredHistory.map((item) => {
                    const resumeSec =
                      savedPositions[item.track.videoId] ?? item.lastPosition ?? 0;
                    return (
                      <div
                        key={item.id}
                        className={`${
                          rightBtnScale === 'sm' ? 'py-1.5 px-1.5' : 'py-2 px-2'
                        } flex items-center justify-between gap-2.5 hover:bg-white/[0.03] rounded-xl transition-colors`}
                      >
                        <button
                          onClick={() => {
                            playSpecificTrack(item.track, resumeSec);
                            if (!isSplitLayout) setActiveTab('player');
                          }}
                          className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                        >
                          <TrackArtwork
                            src={item.track.thumbnailUrl}
                            alt={item.track.title}
                            className={rRowArtworkClass}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`${
                                rightBtnScale === 'sm' ? 'text-xs' : 'text-xs sm:text-sm'
                              } font-medium text-slate-100 truncate`}
                            >
                              {item.track.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono-tabular truncate">
                              <span className="font-sans truncate">{item.track.author}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans">{formatRelativeTime(item.playedAt)}</span>
                              {resumeSec > 5 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-amber-400">
                                    En {formatDuration(resumeSec)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setModalTrackForPlaylist(item.track)}
                            className={`${rIconBtnClass} text-slate-400 hover:text-amber-400 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Guardar en lista"
                            aria-label="Guardar en lista"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Mobile Portrait Mini-Player Bar (Hidden in Mobile Landscape & Desktop) */}
      {!isSplitLayout && activeTab !== 'player' && currentTrack && (
        <div className="px-3 py-2 bg-[#12151E] border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('player')}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
          >
            <TrackArtwork
              src={currentTrack.thumbnailUrl}
              alt={currentTrack.title}
              isPlaying={isPlaying}
              className="w-10 h-10 rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{currentTrack.title}</p>
              <p className="text-[11px] text-slate-400 truncate font-mono-tabular">
                {currentTrack.author} · {formatDuration(currentTime)}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={togglePlayPause}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center cursor-pointer"
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={handleNextTrack}
              className="min-h-[44px] min-w-[44px] rounded-xl text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              aria-label="Siguiente pista"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Portrait Bottom Tab Bar (Hidden in Mobile Landscape & Desktop to maximize vertical height) */}
      {!isSplitLayout && (
        <nav
          className="h-14 bg-[#090A0F]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-5 items-center shrink-0 z-30"
          aria-label="Navegación principal móvil"
        >
          <button
            onClick={() => setActiveTab('player')}
            className={`h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
              activeTab === 'player' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Disc3 className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
              Audio
            </span>
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            className={`h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
              activeTab === 'queue' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListMusic className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
              Cola ({queue.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
              activeTab === 'channels'
                ? 'text-amber-400'
                : newCountByChannel.total > 0
                ? 'text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
              Canales {newCountByChannel.total > 0 ? `(${newCountByChannel.total})` : ''}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('playlists')}
            className={`h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
              activeTab === 'playlists' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderPlus className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
              Listas
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`h-full flex flex-col items-center justify-center transition-colors cursor-pointer ${
              activeTab === 'history' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
              Historial
            </span>
          </button>
        </nav>
      )}

      {/* Modal to Add any Track to Custom Playlists */}
      <AddToPlaylistModal
        track={modalTrackForPlaylist}
        playlists={playlists}
        onClose={() => setModalTrackForPlaylist(null)}
        onAddTrackToPlaylist={handleAddTrackToPlaylist}
        onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
      />
    </div>
  );
}
