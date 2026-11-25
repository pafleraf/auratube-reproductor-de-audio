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
  GripVertical,
  ArrowUp,
  ArrowDown,
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
  SunDim,
  Clock,
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
  QUEUE: 'auratube_queue_v2',
  CURRENT_INDEX: 'auratube_current_idx_v2',
  PLAYLISTS: 'auratube_playlists_v2',
  HISTORY: 'auratube_history_v2',
  SPEED: 'auratube_speed_v1',
  POSITIONS: 'auratube_positions_v1',
  SUBSCRIPTIONS: 'auratube_subscriptions_v2',
  SEEN_EPISODES: 'auratube_seen_episodes_v2',
  LAST_CONNECTION: 'auratube_last_connection_v1',
  SPLIT_PCT: 'auratube_split_pct_v1',
  BTN_SCALE: 'auratube_btn_scale_v1',
  NIGHT_DIM: 'auratube_night_dim_v1',
};

type ButtonScale = 'sm' | 'md' | 'lg';
type NightDimMode = 'auto' | 'forced' | 'off';

interface NightDimSettings {
  mode: NightDimMode;
  startHour: number;
  endHour: number;
  dimLevelPct: number;
  pureOledBlack: boolean;
}

function isHourWithinSchedule(currentHour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true;
  if (startHour > endHour) {
    // Overnight window (e.g., 20:00 to 07:00)
    return currentHour >= startHour || currentHour < endHour;
  }
  // Same-day window (e.g., 01:00 to 06:00)
  return currentHour >= startHour && currentHour < endHour;
}

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

  // URL Input & Floating Top-Right Loader Popover state
  const [urlInput, setUrlInput] = useState('');
  const [showUrlPopover, setShowUrlPopover] = useState(false);
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

  // Channel tab UI states & custom episode order/selection
  const [channelQuery, setChannelQuery] = useState('');
  const [isSubscribingChannel, setIsSubscribingChannel] = useState(false);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>('all');
  const [channelEpisodeOrder, setChannelEpisodeOrder] = useState<string[]>([]);
  const [selectedVideoKey, setSelectedVideoKey] = useState<string | null>(null);

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
  const [showNightDimMenu, setShowNightDimMenu] = useState(false);

  // Automatic System-Time Nocturnal Dimmer & Forced OLED Dark Theme State
  const [nightDim, setNightDim] = useState<NightDimSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.NIGHT_DIM);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<NightDimSettings>;
        return {
          mode:
            parsed.mode === 'auto' || parsed.mode === 'forced' || parsed.mode === 'off'
              ? parsed.mode
              : 'auto',
          startHour:
            typeof parsed.startHour === 'number' && parsed.startHour >= 0 && parsed.startHour <= 23
              ? parsed.startHour
              : 20,
          endHour:
            typeof parsed.endHour === 'number' && parsed.endHour >= 0 && parsed.endHour <= 23
              ? parsed.endHour
              : 7,
          dimLevelPct:
            typeof parsed.dimLevelPct === 'number'
              ? Math.min(75, Math.max(15, parsed.dimLevelPct))
              : 40,
          pureOledBlack: typeof parsed.pureOledBlack === 'boolean' ? parsed.pureOledBlack : true,
        };
      }
    } catch {
      // fallback
    }
    return {
      mode: 'auto',
      startHour: 20,
      endHour: 7,
      dimLevelPct: 40,
      pureOledBlack: true,
    };
  });

  const [systemClock, setSystemClock] = useState<{ hour: number; formatted: string }>(() => {
    const now = new Date();
    return {
      hour: now.getHours(),
      formatted: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
  });

  // Persist nightDim settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.NIGHT_DIM, JSON.stringify(nightDim));
    } catch {
      // ignore
    }
  }, [nightDim]);

  // Automatic timer polling system clock every 15 seconds & on visibility change
  useEffect(() => {
    const syncClock = () => {
      const now = new Date();
      setSystemClock({
        hour: now.getHours(),
        formatted: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      });
    };
    syncClock();
    const interval = setInterval(syncClock, 15000);
    window.addEventListener('focus', syncClock);
    document.addEventListener('visibilitychange', syncClock);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncClock);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, []);

  const isScheduledNightNow = useMemo(
    () => isHourWithinSchedule(systemClock.hour, nightDim.startHour, nightDim.endHour),
    [systemClock.hour, nightDim.startHour, nightDim.endHour]
  );

  const isNightDimActive =
    nightDim.mode === 'forced' || (nightDim.mode === 'auto' && isScheduledNightNow);
  const isPureOledActive = isNightDimActive && nightDim.pureOledBlack;

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

  // Unified chronological episodes list (filtered by selectedChannelFilter, respecting manual reorganization)
  const displayedChannelEpisodes = useMemo(() => {
    const all: ChannelEpisode[] = [];
    for (const ch of subscriptions) {
      if (selectedChannelFilter !== 'all' && ch.channelId !== selectedChannelFilter) continue;
      for (const ep of ch.episodes) {
        all.push(ep);
      }
    }
    const orderMap = new Map<string, number>();
    channelEpisodeOrder.forEach((vid, i) => orderMap.set(vid, i));

    return all.sort((a, b) => {
      const aOrder = orderMap.get(a.videoId);
      const bOrder = orderMap.get(b.videoId);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      const aNew = isEpisodeNew(a) ? 1 : 0;
      const bNew = isEpisodeNew(b) ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      return b.publishedAt - a.publishedAt;
    });
  }, [subscriptions, selectedChannelFilter, isEpisodeNew, channelEpisodeOrder]);

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

  // Start playback for an explicit Track object directly (eliminates stale queue closure bugs)
  const startPlaybackForTrack = useCallback(
    (targetTrack: Track, autoPlay = true, resumePosition?: number) => {
      if (!targetTrack) return;
      markEpisodeSeen(targetTrack.videoId);

      const startPos =
        typeof resumePosition === 'number'
          ? resumePosition
          : savedPositions[targetTrack.videoId] || 0;

      pendingStartPosRef.current = startPos;
      setCurrentTime(startPos);
      setDuration(targetTrack.durationSeconds || 240);
      setSeekTrigger({ time: startPos, seq: Date.now() });

      const audio = audioRef.current;
      if (audio) {
        const streamUrl =
          targetTrack.audioStreamUrl ||
          `/api/youtube/stream?id=${targetTrack.videoId}&duration=${targetTrack.durationSeconds || 240}`;
        audio.src = streamUrl;
        audio.playbackRate = playbackRate;
        (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;

        if (autoPlay) {
          audio.play().catch(() => {
            // Even if carrier audio is delayed, keep playing state for bridge
          });
        } else {
          audio.pause();
        }
      }

      if (autoPlay) {
        setIsPlaying(true);
        setIsBuffering(false);
        recordHistory(targetTrack, startPos);
      } else {
        setIsPlaying(false);
      }
    },
    [playbackRate, savedPositions, recordHistory, markEpisodeSeen]
  );

  // Track navigation callbacks — calls startPlaybackForTrack synchronously inside user gesture
  const playTrackAtIndex = useCallback(
    (index: number, autoPlay = true, resumePosition?: number) => {
      if (index < 0 || index >= queue.length) return;
      const targetTrack = queue[index];
      setCurrentIndex(index);
      if (targetTrack) {
        startPlaybackForTrack(targetTrack, autoPlay, resumePosition);
      }
    },
    [queue, startPlaybackForTrack]
  );

  // Play a specific Track object immediately (from Channels or History)
  const playSpecificTrack = useCallback(
    (track: Track, resumeSec = 0) => {
      const existingIdx = queue.findIndex((t) => t.videoId === track.videoId);
      if (existingIdx !== -1) {
        setCurrentIndex(existingIdx);
      } else {
        setQueue((prev) => [track, ...prev.filter((t) => t.videoId !== track.videoId)]);
        setCurrentIndex(0);
      }
      startPlaybackForTrack(track, true, resumeSec);
      notify(`Reproduciendo: ${track.title}`);
    },
    [queue, startPlaybackForTrack, notify]
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
    if (!audio.src || !audio.src.includes(currentTrack.videoId)) {
      audio.src =
        currentTrack.audioStreamUrl ||
        `/api/youtube/stream?id=${currentTrack.videoId}&duration=${currentTrack.durationSeconds || 240}`;
      setDuration(currentTrack.durationSeconds || 240);
    }
  }, [currentTrack]);

  // Handle pasting and resolving a YouTube URL from the top-right (+) floating box
  const handleAddUrl = async (mode: 'play' | 'queue' = 'play', explicitUrl?: string) => {
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
      setShowUrlPopover(false);

      if (mode === 'play') {
        setQueue((prev) => [
          resolvedTrack,
          ...prev.filter((t) => t.videoId !== resolvedTrack.videoId),
        ]);
        setCurrentIndex(0);
        setActiveTab('player');
        startPlaybackForTrack(resolvedTrack, true, 0);
        notify(`Reproduciendo audio: ${resolvedTrack.title}`);
      } else {
        const alreadyInQueue = queue.some((t) => t.videoId === resolvedTrack.videoId);
        if (alreadyInQueue) {
          notify('La pista ya está en la cola de reproducción');
        } else {
          setQueue((prev) => [...prev, resolvedTrack]);
          notify(`Añadido a la cola: ${resolvedTrack.title}`);
        }
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error al extraer el audio', 'error');
    } finally {
      setIsResolving(false);
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

  // Queue Drag-and-Drop & Touch Reordering State
  const queueListRef = useRef<HTMLDivElement | null>(null);
  const [draggingQueueIdx, setDraggingQueueIdx] = useState<number | null>(null);
  const [dragOverQueueIdx, setDragOverQueueIdx] = useState<number | null>(null);
  const activeDragIdxRef = useRef<number | null>(null);

  const reorderQueueTrack = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    setQueue((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      return copy;
    });

    setCurrentIndex((prevIdx) => {
      if (prevIdx === fromIndex) return toIndex;
      if (fromIndex < prevIdx && toIndex >= prevIdx) return prevIdx - 1;
      if (fromIndex > prevIdx && toIndex <= prevIdx) return prevIdx + 1;
      return prevIdx;
    });
  }, []);

  // Native Touch & Pointer Drag Handler for Queue Rows
  const handleStartQueueDrag = useCallback(
    (startIndex: number) => {
      activeDragIdxRef.current = startIndex;
      setDraggingQueueIdx(startIndex);
      setDragOverQueueIdx(startIndex);

      const resolveTargetIndexFromY = (clientY: number) => {
        const container = queueListRef.current;
        if (!container) return;

        // Auto-scroll container when dragging near top or bottom edges
        const containerRect = container.getBoundingClientRect();
        const edgeThreshold = 36;
        if (clientY < containerRect.top + edgeThreshold) {
          container.scrollTop -= 8;
        } else if (clientY > containerRect.bottom - edgeThreshold) {
          container.scrollTop += 8;
        }

        const rows = container.querySelectorAll<HTMLElement>('[data-queue-idx]');
        let targetIdx: number | null = null;

        rows.forEach((row) => {
          const rect = row.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          const idxAttr = row.getAttribute('data-queue-idx');
          if (idxAttr === null) return;
          const parsedIdx = parseInt(idxAttr, 10);
          if (!Number.isFinite(parsedIdx)) return;

          if (clientY >= rect.top && clientY <= rect.bottom) {
            targetIdx = parsedIdx;
          } else if (
            activeDragIdxRef.current !== null &&
            parsedIdx < activeDragIdxRef.current &&
            clientY < midY &&
            targetIdx === null
          ) {
            targetIdx = parsedIdx;
          } else if (
            activeDragIdxRef.current !== null &&
            parsedIdx > activeDragIdxRef.current &&
            clientY > midY
          ) {
            targetIdx = parsedIdx;
          }
        });

        if (
          targetIdx !== null &&
          activeDragIdxRef.current !== null &&
          targetIdx !== activeDragIdxRef.current
        ) {
          const fromIdx = activeDragIdxRef.current;
          activeDragIdxRef.current = targetIdx;
          setDraggingQueueIdx(targetIdx);
          setDragOverQueueIdx(targetIdx);
          reorderQueueTrack(fromIdx, targetIdx);
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (activeDragIdxRef.current === null) return;
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
          resolveTargetIndexFromY(touch.clientY);
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (activeDragIdxRef.current === null) return;
        resolveTargetIndexFromY(e.clientY);
      };

      const handleEnd = () => {
        activeDragIdxRef.current = null;
        setDraggingQueueIdx(null);
        setDragOverQueueIdx(null);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleEnd);
        window.removeEventListener('touchcancel', handleEnd);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleEnd);
      };

      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('touchcancel', handleEnd);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleEnd);
    },
    [reorderQueueTrack]
  );

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
    notify('Vídeo eliminado de la lista');
  };

  const handleReorderPlaylistTrack = (playlistId: string, fromIndex: number, toIndex: number) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= pl.tracks.length ||
          toIndex >= pl.tracks.length ||
          fromIndex === toIndex
        ) {
          return pl;
        }
        const nextTracks = [...pl.tracks];
        const [moved] = nextTracks.splice(fromIndex, 1);
        nextTracks.splice(toIndex, 0, moved);
        return { ...pl, tracks: nextTracks };
      })
    );
  };

  const handleReorderChannelEpisode = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= displayedChannelEpisodes.length ||
      toIndex >= displayedChannelEpisodes.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const currentOrder = displayedChannelEpisodes.map((ep) => ep.videoId);
    const [moved] = currentOrder.splice(fromIndex, 1);
    currentOrder.splice(toIndex, 0, moved);
    setChannelEpisodeOrder(currentOrder);
  };

  const handleDeleteChannelEpisode = (channelId: string, videoId: string) => {
    setSubscriptions((prev) =>
      prev.map((ch) =>
        ch.channelId === channelId
          ? { ...ch, episodes: ch.episodes.filter((ep) => ep.videoId !== videoId) }
          : ch
      )
    );
    setChannelEpisodeOrder((prev) => prev.filter((id) => id !== videoId));
    notify('Vídeo eliminado del canal');
  };

  const handleReorderHistoryItem = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= filteredHistory.length ||
      toIndex >= filteredHistory.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const sourceItem = filteredHistory[fromIndex];
    const targetItem = filteredHistory[toIndex];
    if (!sourceItem || !targetItem) return;

    setHistory((prev) => {
      const realFrom = prev.findIndex((item) => item.id === sourceItem.id);
      const realTo = prev.findIndex((item) => item.id === targetItem.id);
      if (realFrom === -1 || realTo === -1 || realFrom === realTo) return prev;
      const next = [...prev];
      const [moved] = next.splice(realFrom, 1);
      next.splice(realTo, 0, moved);
      return next;
    });
  };

  const handleDeleteHistoryItem = (itemId: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== itemId));
    notify('Vídeo eliminado del historial');
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
    <div
      className={`h-[100dvh] w-full ${
        isPureOledActive ? 'bg-black' : 'bg-[#090A0F]'
      } text-[#F1F5F9] flex flex-col overflow-hidden select-none transition-colors duration-700`}
    >
      {/* Automatic System-Time Brightness Attenuation Veil (Pointer-Events-None Overlay) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[8500] transition-opacity duration-700"
        style={{
          opacity: isNightDimActive ? nightDim.dimLevelPct / 100 : 0,
          background:
            'radial-gradient(circle at 50% 40%, rgba(4, 3, 2, 0.88), rgba(0, 0, 0, 0.96))',
        }}
      />

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

      {/* Top Header Bar with Integrated Circular (+) Button in Top-Right Corner */}
      <header
        className={`${
          isMobileLandscape ? 'h-11 px-2.5 gap-2' : 'h-14 px-3 sm:px-6 gap-3 sm:gap-6'
        } border-b border-white/[0.07] bg-[#090A0F]/95 backdrop-blur-md flex items-center justify-between shrink-0 z-30 relative`}
      >
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#player"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('player');
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

        {/* Zone 2: Top-Right Utilities + Circular (+) Button to Paste YouTube Link */}
        <div className="flex items-center gap-2 shrink-0">
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

          {/* Circular (+) Button in Top-Right Corner */}
          <button
            type="button"
            onClick={() => setShowUrlPopover((prev) => !prev)}
            className={`${
              isMobileLandscape ? 'w-8 h-8' : 'w-9 h-9 sm:w-10 sm:h-10'
            } rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold shadow-md shadow-amber-500/20 flex items-center justify-center transition-all shrink-0 cursor-pointer`}
            title="Pega enlace YouTube"
            aria-label="Pega enlace YouTube"
            aria-expanded={showUrlPopover}
          >
            <Plus
              className={`w-5 h-5 stroke-[2.5] transition-transform duration-200 ${
                showUrlPopover ? 'rotate-45' : ''
              }`}
            />
          </button>
        </div>
      </header>

      {/* Floating YouTube URL Box Above Interface (Top-Right) */}
      {showUrlPopover && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/25"
            onClick={() => {
              if (!isResolving) setShowUrlPopover(false);
            }}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Pega enlace YouTube"
            className={`fixed ${
              isMobileLandscape ? 'top-12 right-2.5' : 'top-15 right-3 sm:right-6'
            } z-50 w-[min(92vw,360px)] rounded-2xl bg-[#12151E] border border-white/15 shadow-2xl p-3.5 backdrop-blur-xl`}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddUrl('play');
              }}
              className="flex flex-col gap-2.5"
            >
              <label
                htmlFor="youtube-url-popover-input"
                className="text-xs font-semibold text-slate-200 tracking-wide"
              >
                Pega enlace YouTube
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="youtube-url-popover-input"
                  type="url"
                  autoFocus
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && !isResolving) {
                      setShowUrlPopover(false);
                    }
                  }}
                  placeholder="Pega enlace YouTube"
                  className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl bg-[#090A0F] border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
                  disabled={isResolving}
                />
                <button
                  type="submit"
                  disabled={isResolving}
                  className="min-h-[40px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-slate-950 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer"
                >
                  {isResolving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Cargar</span>
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Non-intrusive Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`fixed ${
            isMobileLandscape ? 'top-12' : 'top-16'
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
          style={{
            ...(isSplitLayout ? { width: `${leftSplitPct}%` } : {}),
            ...(isNightDimActive
              ? {
                  filter: `brightness(${Math.max(
                    0.5,
                    1 - nightDim.dimLevelPct / 170
                  ).toFixed(2)})`,
                }
              : {}),
          }}
          className={`relative h-full min-h-0 shrink-0 flex flex-col justify-between ${
            isPureOledActive
              ? 'bg-black border-amber-500/15'
              : 'bg-[#12151E] border-white/[0.08]'
          } border rounded-2xl ${
            isMobileLandscape ? 'p-2.5' : 'p-3.5 sm:p-5'
          } overflow-hidden transition-all duration-700 ${
            isSplitLayout || activeTab === 'player' ? 'flex' : 'hidden'
          }`}
        >
          {/* Ambient Blurred Video Thumbnail Aura Behind Player (Reduced in Forced OLED Mode) */}
          {currentTrack?.thumbnailUrl && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-8 z-0 ${
                isPureOledActive ? 'opacity-5' : 'opacity-20'
              } blur-3xl transition-opacity duration-700`}
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
              {isNightDimActive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className="text-amber-300/90 font-mono-tabular truncate"
                    title={`Tema oscuro forzado / Atenuación activa (${systemClock.formatted})`}
                  >
                    {isPureOledActive ? 'OLED' : 'Atenuado'} -{nightDim.dimLevelPct}%
                  </span>
                </>
              )}
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

          {/* Secondary Studio Utility Bar: Speed (0.5x-2x), Sleep Timer, System-Time Auto Dimmer, Repeat & Volume */}
          <div
            className={`${
              isMobileLandscape ? 'mt-1.5 pt-1.5' : 'mt-3 pt-2.5'
            } border-t border-white/[0.07] flex items-center justify-between gap-1 shrink-0 relative z-20`}
          >
            {/* Playback Speed Control */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeedMenu((prev) => !prev);
                  setShowSleepMenu(false);
                  setShowNightDimMenu(false);
                }}
                className={`${
                  isMobileLandscape ? 'min-h-[32px] px-2 text-[11px]' : 'min-h-[44px] px-2.5 text-xs'
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
                  setShowNightDimMenu(false);
                }}
                className={`${
                  isMobileLandscape ? 'min-h-[32px] px-2 text-[11px]' : 'min-h-[44px] px-2.5 text-xs'
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

            {/* Automatic System-Time Nocturnal Dimmer & Forced OLED Dark Theme */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNightDimMenu((prev) => !prev);
                  setShowSpeedMenu(false);
                  setShowSleepMenu(false);
                }}
                className={`${
                  isMobileLandscape ? 'min-h-[32px] px-2 text-[11px]' : 'min-h-[44px] px-2.5 text-xs'
                } rounded-xl border font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                  isNightDimActive
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : nightDim.mode === 'auto'
                    ? 'bg-[#090A0F] border-amber-500/25 text-slate-200 hover:text-white'
                    : 'bg-[#090A0F] border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Temporizador automático de tema oscuro forzado y atenuación de brillo por hora del sistema"
              >
                <SunDim className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-mono-tabular">
                  {isNightDimActive
                    ? `-${nightDim.dimLevelPct}%`
                    : nightDim.mode === 'auto'
                    ? `${String(nightDim.startHour).padStart(2, '0')}h`
                    : 'Brillo'}
                </span>
              </button>

              {showNightDimMenu && (
                <div className="absolute bottom-11 right-0 sm:left-1/2 sm:-translate-x-1/2 z-40 w-64 rounded-2xl bg-[#090A0F] border border-white/15 p-3 shadow-2xl space-y-2.5">
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <div>
                      <p className="text-xs font-semibold text-white">
                        Brillo & OLED Nocturno
                      </p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono-tabular">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Sistema: {systemClock.formatted}</span>
                        <span>·</span>
                        <span className={isNightDimActive ? 'text-amber-300' : 'text-slate-400'}>
                          {isNightDimActive ? 'Activo' : 'En espera'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Mode Selector: Auto (System Time), Forced, Off */}
                  <div className="grid grid-cols-3 gap-1 bg-[#12151E] p-1 rounded-xl border border-white/10">
                    {(
                      [
                        { id: 'auto', label: 'Auto (Hora)' },
                        { id: 'forced', label: 'Forzar' },
                        { id: 'off', label: 'Apagado' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setNightDim((prev) => ({ ...prev, mode: m.id }));
                          notify(
                            m.id === 'auto'
                              ? `Atenuación automática (${String(nightDim.startHour).padStart(2, '0')}:00 - ${String(nightDim.endHour).padStart(2, '0')}:00)`
                              : m.id === 'forced'
                              ? 'Tema oscuro OLED y atenuación forzados'
                              : 'Atenuación nocturna desactivada'
                          );
                        }}
                        className={`py-1.5 px-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                          nightDim.mode === m.id
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Automatic System Hour Window Selector */}
                  {nightDim.mode === 'auto' && (
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Activar desde
                        </label>
                        <select
                          value={nightDim.startHour}
                          onChange={(e) =>
                            setNightDim((prev) => ({
                              ...prev,
                              startHour: parseInt(e.target.value, 10),
                            }))
                          }
                          className="w-full h-8 px-2 rounded-lg bg-[#12151E] border border-white/10 text-xs text-slate-100 font-mono-tabular focus:outline-none focus:border-amber-500"
                        >
                          {[18, 19, 20, 21, 22, 23, 0].map((hr) => (
                            <option key={hr} value={hr}>
                              {String(hr).padStart(2, '0')}:00
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Hasta las
                        </label>
                        <select
                          value={nightDim.endHour}
                          onChange={(e) =>
                            setNightDim((prev) => ({
                              ...prev,
                              endHour: parseInt(e.target.value, 10),
                            }))
                          }
                          className="w-full h-8 px-2 rounded-lg bg-[#12151E] border border-white/10 text-xs text-slate-100 font-mono-tabular focus:outline-none focus:border-amber-500"
                        >
                          {[5, 6, 7, 8, 9, 10].map((hr) => (
                            <option key={hr} value={hr}>
                              {String(hr).padStart(2, '0')}:00
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Brightness Attenuation Level Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">Atenuación de brillo</span>
                      <span className="text-amber-400 font-mono-tabular font-semibold">
                        -{nightDim.dimLevelPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={75}
                      step={5}
                      value={nightDim.dimLevelPct}
                      onChange={(e) =>
                        setNightDim((prev) => ({
                          ...prev,
                          dimLevelPct: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full h-5 audio-scrubber bg-white/10 rounded-full"
                      aria-label="Nivel de atenuación de brillo"
                    />
                  </div>

                  {/* Pure OLED Black Theme Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      setNightDim((prev) => ({
                        ...prev,
                        pureOledBlack: !prev.pureOledBlack,
                      }))
                    }
                    className="w-full py-1.5 px-2.5 rounded-xl bg-[#12151E] border border-white/10 hover:border-amber-500/40 flex items-center justify-between text-xs text-slate-200 cursor-pointer transition-colors"
                  >
                    <span>Tema OLED Negro Puro</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        nightDim.pureOledBlack
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      {nightDim.pureOledBlack ? 'ON' : 'OFF'}
                    </span>
                  </button>
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
          {/* Sub-Header inside Right Panel: Active Section Label + Button Size Control (S / M / L) & Contextual Actions */}
          <div
            className={`${
              isMobileLandscape ? 'px-2.5 py-1.5' : 'px-3 sm:px-5 py-2'
            } w-full min-w-0 border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0 overflow-hidden`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {rightActiveTab === 'queue' && (
                <>
                  <ListMusic className="w-4 h-4 text-amber-400 shrink-0" />
                  <h2 className="text-xs sm:text-sm font-semibold font-display text-white truncate">
                    Cola de reproducción
                  </h2>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    ({queue.length})
                  </span>
                </>
              )}
              {rightActiveTab === 'channels' && (
                <>
                  <Radio className="w-4 h-4 text-amber-400 shrink-0" />
                  <h2 className="text-xs sm:text-sm font-semibold font-display text-white truncate">
                    Canales suscritos
                  </h2>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    ({displayedChannelEpisodes.length})
                  </span>
                </>
              )}
              {rightActiveTab === 'playlists' && (
                <>
                  <FolderPlus className="w-4 h-4 text-amber-400 shrink-0" />
                  <h2 className="text-xs sm:text-sm font-semibold font-display text-white truncate">
                    Listas de reproducción
                  </h2>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    ({playlists.length})
                  </span>
                </>
              )}
              {rightActiveTab === 'history' && (
                <>
                  <History className="w-4 h-4 text-amber-400 shrink-0" />
                  <h2 className="text-xs sm:text-sm font-semibold font-display text-white truncate">
                    Historial de escucha
                  </h2>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    ({history.length})
                  </span>
                </>
              )}
            </div>

            {/* Right Controls: Dimensionable Button Size Selector (S/M/L) + Contextual Action */}
            <div className="flex items-center gap-1 shrink-0">
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
                    className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 font-medium text-slate-300 hover:text-amber-300 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                    title="Sincronizar listas y pistas con Google Drive"
                    aria-label="Sincronizar con Google Drive"
                  >
                    <Cloud className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="hidden md:inline">Drive</span>
                  </button>
                  <button
                    onClick={saveQueueAsPlaylist}
                    className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 font-medium text-slate-200 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                    title="Guardar cola actual como lista"
                    aria-label="Guardar cola actual como lista"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="hidden md:inline">Guardar</span>
                  </button>
                </div>
              )}

              {rightActiveTab === 'channels' && newCountByChannel.total > 0 && (
                <button
                  onClick={handleMarkAllEpisodesAsSeen}
                  className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-amber-500/40 font-medium text-amber-400 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                  title="Marcar todos los episodios nuevos como vistos"
                  aria-label="Marcar todos los episodios nuevos como vistos"
                >
                  <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">Vistos</span>
                </button>
              )}

              {rightActiveTab === 'history' && history.length > 0 && (
                <button
                  onClick={() => {
                    setHistory([]);
                    notify('Historial de escucha borrado');
                  }}
                  title="Limpiar historial"
                  aria-label="Limpiar historial"
                  className={`${rActionBtnClass} bg-[#090A0F] border border-white/10 hover:border-red-500/40 font-medium text-slate-300 hover:text-red-300 flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer`}
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">Limpiar</span>
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: INTERACTIVE QUEUE WITH DIRECT DRAG-AND-DROP & TOUCH REORDERING */}
          {rightActiveTab === 'queue' && (
            <div
              ref={queueListRef}
              className="flex-1 min-h-0 overflow-y-auto custom-scroll p-2.5 sm:p-4 space-y-1"
            >
              {queue.map((track, idx) => {
                const isCurrent = idx === currentIndex;
                const rowKey = `queue-${track.videoId}-${idx}`;
                const isSelected = selectedVideoKey === rowKey;
                const isDraggingThis = draggingQueueIdx === idx;
                const isDragOverThis =
                  dragOverQueueIdx === idx &&
                  draggingQueueIdx !== null &&
                  draggingQueueIdx !== idx;
                const savedPos = savedPositions[track.videoId] || 0;

                return (
                  <div
                    key={rowKey}
                    data-queue-idx={idx}
                    draggable
                    onClick={() => setSelectedVideoKey(rowKey)}
                    onDragStart={(e) => {
                      activeDragIdxRef.current = idx;
                      setDraggingQueueIdx(idx);
                      setDragOverQueueIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverQueueIdx !== idx) {
                        setDragOverQueueIdx(idx);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx =
                        activeDragIdxRef.current ??
                        parseInt(e.dataTransfer.getData('text/plain'), 10);
                      if (Number.isFinite(fromIdx) && fromIdx !== idx) {
                        reorderQueueTrack(fromIdx, idx);
                      }
                      activeDragIdxRef.current = null;
                      setDraggingQueueIdx(null);
                      setDragOverQueueIdx(null);
                    }}
                    onDragEnd={() => {
                      activeDragIdxRef.current = null;
                      setDraggingQueueIdx(null);
                      setDragOverQueueIdx(null);
                    }}
                    className={`${
                      rightBtnScale === 'sm' ? 'py-1.5 px-2' : 'py-2 px-2.5'
                    } rounded-xl flex items-center justify-between gap-2 transition-all select-none ${
                      isDraggingThis
                        ? 'bg-amber-500/20 ring-1 ring-amber-400/70 shadow-xl scale-[1.01] z-20 relative'
                        : isDragOverThis
                        ? 'bg-white/[0.06] ring-1 ring-amber-400/50'
                        : isCurrent
                        ? 'bg-amber-500/10 border border-amber-500/25'
                        : isSelected
                        ? 'bg-white/[0.05] border border-amber-500/30'
                        : 'hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    {/* Tactile Drag Handle (Touch & Mouse) */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Arrastrar para reordenar ${track.title}`}
                      title="Arrastra para cambiar el orden en la cola"
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setSelectedVideoKey(rowKey);
                        handleStartQueueDrag(idx);
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        setSelectedVideoKey(rowKey);
                        handleStartQueueDrag(idx);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && idx > 0) {
                          e.preventDefault();
                          reorderQueueTrack(idx, idx - 1);
                        } else if (e.key === 'ArrowDown' && idx < queue.length - 1) {
                          e.preventDefault();
                          reorderQueueTrack(idx, idx + 1);
                        }
                      }}
                      className={`${rIconBtnClass} touch-none cursor-grab active:cursor-grabbing text-slate-500 hover:text-amber-400 active:text-amber-300 flex items-center justify-center shrink-0 transition-colors`}
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <button
                      onClick={() => {
                        setSelectedVideoKey(rowKey);
                        playTrackAtIndex(idx, true);
                      }}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVideoKey(rowKey);
                          reorderQueueTrack(idx, idx - 1);
                        }}
                        disabled={idx === 0}
                        className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Subir vídeo"
                        aria-label="Subir vídeo"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVideoKey(rowKey);
                          reorderQueueTrack(idx, idx + 1);
                        }}
                        disabled={idx === queue.length - 1}
                        className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Bajar vídeo"
                        aria-label="Bajar vídeo"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVideoKey(rowKey);
                          setModalTrackForPlaylist(track);
                        }}
                        className={`${rIconBtnClass} text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Añadir a lista"
                        aria-label="Añadir a lista"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeQueueTrack(idx);
                        }}
                        className={`${rIconBtnClass} text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                        title="Eliminar de la cola"
                        aria-label="Eliminar de la cola"
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
                  displayedChannelEpisodes.map((ep, idx) => {
                    const isNew = isEpisodeNew(ep);
                    const isCurrentlyPlaying =
                      currentTrack?.videoId === ep.videoId && isPlaying;
                    const rowKey = `channel-${ep.channelId}-${ep.videoId}`;
                    const isSelected = selectedVideoKey === rowKey;

                    return (
                      <div
                        key={rowKey}
                        draggable
                        onClick={() => setSelectedVideoKey(rowKey)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(idx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                          if (Number.isFinite(fromIdx) && fromIdx !== idx) {
                            handleReorderChannelEpisode(fromIdx, idx);
                          }
                        }}
                        className={`${
                          rightBtnScale === 'sm' ? 'py-1.5 px-2' : 'py-2 px-2.5'
                        } rounded-xl flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-white/[0.06] border border-amber-500/30'
                            : isNew
                            ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1] border border-transparent'
                            : 'hover:bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <button
                          onClick={() => {
                            setSelectedVideoKey(rowKey);
                            playSpecificTrack(ep, 0);
                          }}
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

                        {/* Episode Quick Actions: Reorganize + Add to Queue + Save to Playlist + Delete */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
                              handleReorderChannelEpisode(idx, idx - 1);
                            }}
                            disabled={idx === 0}
                            className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Subir vídeo"
                            aria-label="Subir vídeo"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
                              handleReorderChannelEpisode(idx, idx + 1);
                            }}
                            disabled={idx === displayedChannelEpisodes.length - 1}
                            className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Bajar vídeo"
                            aria-label="Bajar vídeo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
                              setModalTrackForPlaylist(ep);
                            }}
                            className={`${rIconBtnClass} text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Guardar episodio en lista"
                            aria-label="Guardar episodio en lista"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteChannelEpisode(ep.channelId, ep.videoId);
                            }}
                            className={`${rIconBtnClass} text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Eliminar vídeo del canal"
                            aria-label="Eliminar vídeo del canal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
                        {activePlaylist.tracks.map((track, idx) => {
                          const rowKey = `pl-${activePlaylist.id}-${track.videoId}-${idx}`;
                          const isSelected = selectedVideoKey === rowKey;
                          return (
                            <div
                              key={rowKey}
                              draggable
                              onClick={() => setSelectedVideoKey(rowKey)}
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', String(idx));
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                                if (Number.isFinite(fromIdx) && fromIdx !== idx) {
                                  handleReorderPlaylistTrack(activePlaylist.id, fromIdx, idx);
                                }
                              }}
                              className={`${
                                rightBtnScale === 'sm' ? 'py-1.5 px-1.5' : 'py-2 px-2'
                              } flex items-center justify-between gap-2 rounded-xl transition-colors ${
                                isSelected
                                  ? 'bg-white/[0.06] border border-amber-500/30'
                                  : 'hover:bg-white/[0.03] border border-transparent'
                              }`}
                            >
                              <button
                                onClick={() => {
                                  setSelectedVideoKey(rowKey);
                                  handlePlayEntirePlaylist(activePlaylist, idx);
                                }}
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

                              <div className="flex items-center gap-0.5 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVideoKey(rowKey);
                                    handleReorderPlaylistTrack(activePlaylist.id, idx, idx - 1);
                                  }}
                                  disabled={idx === 0}
                                  className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                                  title="Subir vídeo en la lista"
                                  aria-label="Subir vídeo en la lista"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVideoKey(rowKey);
                                    handleReorderPlaylistTrack(activePlaylist.id, idx, idx + 1);
                                  }}
                                  disabled={idx === activePlaylist.tracks.length - 1}
                                  className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                                  title="Bajar vídeo en la lista"
                                  aria-label="Bajar vídeo en la lista"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVideoKey(rowKey);
                                    setQueue((prev) => {
                                      if (prev.some((t) => t.videoId === track.videoId)) {
                                        notify('El vídeo ya está en la cola');
                                        return prev;
                                      }
                                      notify(`Añadido a la cola: ${track.title}`);
                                      return [...prev, track];
                                    });
                                  }}
                                  className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                                  title="Añadir a la cola"
                                  aria-label="Añadir a la cola"
                                >
                                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveTrackFromPlaylist(activePlaylist.id, track.videoId);
                                  }}
                                  className={`${rIconBtnClass} text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                                  title="Eliminar de la lista"
                                  aria-label="Eliminar de la lista"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
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
                  filteredHistory.map((item, idx) => {
                    const resumeSec =
                      savedPositions[item.track.videoId] ?? item.lastPosition ?? 0;
                    const rowKey = `hist-${item.id}`;
                    const isSelected = selectedVideoKey === rowKey;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onClick={() => setSelectedVideoKey(rowKey)}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(idx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                          if (Number.isFinite(fromIdx) && fromIdx !== idx) {
                            handleReorderHistoryItem(fromIdx, idx);
                          }
                        }}
                        className={`${
                          rightBtnScale === 'sm' ? 'py-1.5 px-1.5' : 'py-2 px-2'
                        } flex items-center justify-between gap-2 rounded-xl transition-colors ${
                          isSelected
                            ? 'bg-white/[0.06] border border-amber-500/30'
                            : 'hover:bg-white/[0.03] border border-transparent'
                        }`}
                      >
                        <button
                          onClick={() => {
                            setSelectedVideoKey(rowKey);
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

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
                              handleReorderHistoryItem(idx, idx - 1);
                            }}
                            disabled={idx === 0}
                            className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Subir en el historial"
                            aria-label="Subir en el historial"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
                              handleReorderHistoryItem(idx, idx + 1);
                            }}
                            disabled={idx === filteredHistory.length - 1}
                            className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Bajar en el historial"
                            aria-label="Bajar en el historial"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
                              setQueue((prev) => {
                                if (prev.some((t) => t.videoId === item.track.videoId)) {
                                  notify('El vídeo ya está en la cola');
                                  return prev;
                                }
                                notify(`Añadido a la cola: ${item.track.title}`);
                                return [...prev, item.track];
                              });
                            }}
                            className={`${rIconBtnClass} text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Añadir a la cola"
                            aria-label="Añadir a la cola"
                          >
                            <Plus className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedVideoKey(rowKey);
                              setModalTrackForPlaylist(item.track);
                            }}
                            className={`${rIconBtnClass} text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Guardar en lista"
                            aria-label="Guardar en lista"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteHistoryItem(item.id);
                            }}
                            className={`${rIconBtnClass} text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer`}
                            title="Eliminar del historial"
                            aria-label="Eliminar del historial"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Unified Bottom Selection Bar: Audio, Cola, Canales, Listas e Historial */}
      <nav
        className={`${
          isMobileLandscape ? 'h-11' : 'h-14'
        } bg-[#090A0F]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-5 items-center shrink-0 z-30`}
        aria-label="Navegación principal"
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
            (isSplitLayout ? rightActiveTab === 'queue' : activeTab === 'queue')
              ? 'text-amber-400'
              : 'text-slate-400 hover:text-slate-200'
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
            (isSplitLayout ? rightActiveTab === 'channels' : activeTab === 'channels')
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
            (isSplitLayout ? rightActiveTab === 'playlists' : activeTab === 'playlists')
              ? 'text-amber-400'
              : 'text-slate-400 hover:text-slate-200'
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
            (isSplitLayout ? rightActiveTab === 'history' : activeTab === 'history')
              ? 'text-amber-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">
            Historial
          </span>
        </button>
      </nav>

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
