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
};

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
  // Navigation & responsive layout state
  const [activeTab, setActiveTab] = useState<ActiveTab>('player');

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

  // Update stored connection timestamp for next visit
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTION, String(Date.now()));
    } catch {
      // ignore
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
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

  // Track navigation callbacks
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

      if (audio.src !== new URL(streamUrl, window.location.origin).href) {
        audio.src = streamUrl;
        audio.load();
      }
      audio.playbackRate = playbackRate;
      (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;

      const startPos =
        typeof resumePosition === 'number'
          ? resumePosition
          : savedPositions[targetTrack.videoId] || 0;

      const applyStartAndPlay = () => {
        if (startPos > 0 && startPos < (targetTrack.durationSeconds || 240) - 5) {
          try {
            audio.currentTime = startPos;
          } catch {
            // ignore before metadata loaded
          }
        }
        if (autoPlay) {
          audio
            .play()
            .then(() => {
              setIsPlaying(true);
              recordHistory(targetTrack, startPos);
            })
            .catch(() => {
              setIsPlaying(false);
            });
        }
      };

      if (audio.readyState >= 1) {
        applyStartAndPlay();
      } else {
        audio.addEventListener('loadedmetadata', applyStartAndPlay, { once: true });
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
        setTimeout(() => playTrackAtIndex(0, true, resumeSec), 30);
      }
      notify(`Reproduciendo: ${track.title}`);
    },
    [queue, playTrackAtIndex, markEpisodeSeen, notify]
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
    const audio = audioRef.current;
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    if (currentIndex > 0) {
      playTrackAtIndex(currentIndex - 1, true, 0);
    } else if (repeatMode === 'all' && queue.length > 0) {
      playTrackAtIndex(queue.length - 1, true, 0);
    }
  }, [currentIndex, repeatMode, queue.length, playTrackAtIndex]);

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

    if (audio.paused) {
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          recordHistory(currentTrack, audio.currentTime);
        })
        .catch(() => {
          notify('Toca Reproducir para iniciar el motor de audio', 'error');
        });
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [currentTrack, playbackRate, recordHistory, notify]);

  const seekBySeconds = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const maxDur = Number.isFinite(audio.duration) ? audio.duration : duration || 240;
      const nextPos = Math.max(0, Math.min(maxDur, audio.currentTime + delta));
      audio.currentTime = nextPos;
      setCurrentTime(nextPos);
    },
    [duration]
  );

  const seekToAbsolute = useCallback((targetSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = targetSec;
    setCurrentTime(targetSec);
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
      {/* Native HTML5 Audio Element for Persistent Background Playback */}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setDuration(el.duration);
          } else if (currentTrack?.durationSeconds) {
            setDuration(currentTrack.durationSeconds);
          }
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const now = el.currentTime;
          setCurrentTime(now);

          if (currentTrack && Math.floor(now) % 4 === 0 && now > 2) {
            setSavedPositions((prev) => ({
              ...prev,
              [currentTrack.videoId]: Math.floor(now),
            }));
          }

          if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
            const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : effectiveDuration;
            if (dur > 0 && now <= dur) {
              try {
                navigator.mediaSession.setPositionState({
                  duration: dur,
                  playbackRate: el.playbackRate || 1,
                  position: now,
                });
              } catch {
                // ignore invalid position state
              }
            }
          }
        }}
        onEnded={() => {
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

      {/* Top Navigation & Instant YouTube Link Bar (Respects 3-Zone Top Bar Contract & 15% Sticky Cap) */}
      <header className="h-14 px-3 sm:px-6 border-b border-white/[0.07] bg-[#090A0F]/95 backdrop-blur-md flex items-center justify-between gap-3 sm:gap-8 shrink-0 z-30">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#player"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('player');
          }}
          className="text-base sm:text-lg font-bold font-display tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <Disc3
            className={`w-5 h-5 text-amber-500 ${isPlaying ? 'animate-spin' : ''}`}
            style={{ animationDuration: '6s' }}
          />
          <span>AuraTube</span>
        </a>

        {/* Zone 2: Desktop Single-Line Navigation Links (5 links) */}
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

        {/* Zone 3: Single Primary Action (Install PWA / App Mode) */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
        </div>
      </header>

      {/* Compact YouTube URL Paste Bar */}
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

      {/* Non-intrusive Feedback Banner */}
      {feedbackMsg && (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] pointer-events-none">
          <div
            className={`px-4 py-2.5 rounded-xl border shadow-xl backdrop-blur-md text-xs font-medium flex items-center gap-2 ${
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

      {/* Main Content Area — Single-Viewport Fit (100dvh minus header & bottom nav) */}
      <main className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-3 sm:px-6 py-2 sm:py-4 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* LEFT COLUMN (Always visible on Desktop, visible on Mobile when activeTab === 'player') */}
        <section
          className={`lg:col-span-5 h-full min-h-0 flex flex-col justify-between bg-[#12151E] border border-white/[0.07] rounded-2xl p-4 sm:p-6 overflow-hidden ${
            activeTab === 'player' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Top Status Row: Clean Unboxed Metadata */}
          <div className="flex items-center justify-between gap-2 text-xs text-slate-400 shrink-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-amber-400 font-medium">Audio Puro</span>
              <span aria-hidden="true">·</span>
              <span>Media Session Activa</span>
              {sleepRemainingSec !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300 font-mono-tabular">
                    Apagado {formatDuration(sleepRemainingSec)}
                  </span>
                </>
              )}
              {sleepOnTrackEnd && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300">Fin de pista</span>
                </>
              )}
            </div>

            {currentTrack && (
              <button
                onClick={() => setModalTrackForPlaylist(currentTrack)}
                className="min-h-[36px] px-2.5 rounded-lg hover:bg-white/5 text-slate-300 hover:text-amber-400 flex items-center gap-1 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Guardar pista actual en una lista"
              >
                <BookmarkPlus className="w-4 h-4 text-amber-400" />
                <span>Guardar</span>
              </button>
            )}
          </div>

          {/* Center Artwork, Track Title & 1-Tap Channel Subscribe Action */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center my-2 text-center overflow-hidden">
            <TrackArtwork
              src={currentTrack?.thumbnailUrl || ''}
              alt={currentTrack?.title || 'Carátula de audio'}
              isPlaying={isPlaying}
              className="w-32 h-32 xs:w-40 xs:h-40 sm:w-52 sm:h-52 max-h-[28dvh] aspect-square rounded-2xl shadow-2xl"
            />

            <div className="mt-3 w-full max-w-md px-2">
              <h1 className="text-base sm:text-xl font-bold font-display text-white line-clamp-2 leading-snug">
                {currentTrack ? currentTrack.title : 'Pega un enlace de YouTube'}
              </h1>

              <div className="mt-1.5 flex items-center justify-center flex-wrap gap-2 text-xs sm:text-sm text-slate-400">
                <span className="truncate max-w-[180px] sm:max-w-[220px] font-medium text-slate-300">
                  {currentTrack ? currentTrack.author : 'Sin pista activa'}
                </span>

                {currentTrack && (
                  <>
                    <button
                      onClick={handleToggleSubscribeCurrentTrack}
                      disabled={isSubscribingChannel}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

                    <span aria-hidden="true">·</span>
                    <a
                      href={currentTrack.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-amber-400 underline-offset-2 hover:underline whitespace-nowrap shrink-0"
                    >
                      <span>YouTube</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Scrubber & Time Telemetry (Tabular Numerals) */}
          <div className="w-full space-y-1.5 shrink-0">
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
                className="w-full h-6 audio-scrubber bg-white/10 rounded-full"
                aria-label="Posición de reproducción"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono-tabular">
              <span>{formatDuration(currentTime)}</span>
              <span>
                {isBuffering
                  ? 'Cargando stream...'
                  : `-${formatDuration(Math.max(0, effectiveDuration - currentTime))}`}
              </span>
              <span>{formatDuration(effectiveDuration)}</span>
            </div>
          </div>

          {/* Primary Transport Controls (All >= 44x44px touch targets) */}
          <div className="mt-2 sm:mt-3 flex items-center justify-between gap-1 sm:gap-2 shrink-0">
            <button
              onClick={() => seekBySeconds(-10)}
              className="min-h-[44px] min-w-[44px] rounded-xl text-slate-300 hover:text-white hover:bg-white/5 flex flex-col items-center justify-center transition-colors cursor-pointer"
              title="Retroceder 10 segundos"
              aria-label="Retroceder 10 segundos"
            >
              <RotateCcw className="w-5 h-5" />
              <span className="text-[10px] font-mono-tabular text-slate-400">-10s</span>
            </button>

            <button
              onClick={handlePrevTrack}
              className="min-h-[48px] min-w-[48px] rounded-xl text-slate-200 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
              title="Pista anterior"
              aria-label="Pista anterior"
            >
              <SkipBack className="w-6 h-6" />
            </button>

            <button
              onClick={togglePlayPause}
              className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? 'Pausar' : 'Reproducir en segundo plano'}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isBuffering ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={handleNextTrack}
              className="min-h-[48px] min-w-[48px] rounded-xl text-slate-200 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
              title="Siguiente pista"
              aria-label="Siguiente pista"
            >
              <SkipForward className="w-6 h-6" />
            </button>

            <button
              onClick={() => seekBySeconds(10)}
              className="min-h-[44px] min-w-[44px] rounded-xl text-slate-300 hover:text-white hover:bg-white/5 flex flex-col items-center justify-center transition-colors cursor-pointer"
              title="Adelantar 10 segundos"
              aria-label="Adelantar 10 segundos"
            >
              <RotateCw className="w-5 h-5" />
              <span className="text-[10px] font-mono-tabular text-slate-400">+10s</span>
            </button>
          </div>

          {/* Secondary Studio Utility Bar: Speed (0.5x-2x), Sleep Timer, Repeat & Volume */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.07] flex items-center justify-between gap-2 shrink-0 relative">
            {/* Playback Speed Control */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeedMenu((prev) => !prev);
                  setShowSleepMenu(false);
                }}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-mono-tabular font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  playbackRate !== 1
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-[#090A0F] border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Velocidad de reproducción"
              >
                <Gauge className="w-4 h-4 text-amber-400" />
                <span>{playbackRate}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-12 left-0 z-40 w-44 rounded-2xl bg-[#090A0F] border border-white/15 p-2 shadow-2xl">
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
                        className={`min-h-[38px] rounded-xl text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
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
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  sleepRemainingSec !== null || sleepOnTrackEnd
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-[#090A0F] border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Temporizador de apagado automático (Sleep Timer)"
              >
                <Moon className="w-4 h-4 text-amber-400" />
                <span className="font-mono-tabular">
                  {sleepRemainingSec !== null
                    ? formatDuration(sleepRemainingSec)
                    : sleepOnTrackEnd
                    ? 'Fin pista'
                    : 'Timer'}
                </span>
              </button>

              {showSleepMenu && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 w-48 rounded-2xl bg-[#090A0F] border border-white/15 p-2 shadow-2xl">
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
                          className={`w-full min-h-[38px] px-3 rounded-xl text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
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
              className={`min-h-[44px] min-w-[44px] px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                repeatMode !== 'off'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#090A0F] border-white/10 text-slate-300 hover:text-white'
              }`}
              title="Modo de repetición"
              aria-label="Modo de repetición"
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-4 h-4 text-amber-400" />
              ) : (
                <Repeat className="w-4 h-4" />
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
              className="min-h-[44px] min-w-[44px] rounded-xl bg-[#090A0F] border border-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title={isMuted ? 'Activar sonido' : 'Silenciar'}
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </section>

        {/* RIGHT COLUMN (Workspace Panel for Queue, Channels, Playlists, and History) */}
        <section
          className={`lg:col-span-7 h-full min-h-0 flex flex-col bg-[#12151E] border border-white/[0.07] rounded-2xl overflow-hidden ${
            activeTab === 'player' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Sub-Header Switcher inside Right Panel */}
          <div className="px-3 sm:px-5 py-3 border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0 overflow-x-auto custom-scroll">
            <div className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-xl border border-white/5 shrink-0">
              <button
                onClick={() => setActiveTab('queue')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'queue' || activeTab === 'player'
                    ? 'bg-[#12151E] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Cola ({queue.length})
              </button>
              <button
                onClick={() => setActiveTab('channels')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'channels'
                    ? 'bg-[#12151E] text-white shadow-sm'
                    : newCountByChannel.total > 0
                    ? 'text-amber-400 hover:text-amber-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Canales {newCountByChannel.total > 0 ? `(${newCountByChannel.total} nuevos)` : `(${subscriptions.length})`}
              </button>
              <button
                onClick={() => setActiveTab('playlists')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'playlists'
                    ? 'bg-[#12151E] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Listas ({playlists.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-[#12151E] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Historial ({history.length})
              </button>
            </div>

            {/* Contextual Action for Active Panel */}
            {(activeTab === 'queue' || activeTab === 'player') && queue.length > 0 && (
              <button
                onClick={saveQueueAsPlaylist}
                className="min-h-[38px] px-3 rounded-xl bg-[#090A0F] border border-white/10 hover:border-amber-500/40 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>Guardar cola</span>
              </button>
            )}

            {activeTab === 'channels' && newCountByChannel.total > 0 && (
              <button
                onClick={handleMarkAllEpisodesAsSeen}
                className="min-h-[38px] px-3 rounded-xl bg-[#090A0F] border border-white/10 hover:border-amber-500/40 text-xs font-medium text-amber-400 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Marcar todos los episodios nuevos como vistos"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Marcar vistos</span>
              </button>
            )}

            {activeTab === 'history' && history.length > 0 && (
              <button
                onClick={() => {
                  setHistory([]);
                  notify('Historial de escucha borrado');
                }}
                className="min-h-[38px] px-3 rounded-xl bg-[#090A0F] border border-white/10 hover:border-red-500/40 text-xs font-medium text-slate-300 hover:text-red-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {/* TAB 1: INTERACTIVE QUEUE WITH REORDERING */}
          {(activeTab === 'queue' || activeTab === 'player') && (
            <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 sm:p-4 divide-y divide-white/[0.05]">
              {queue.map((track, idx) => {
                const isCurrent = idx === currentIndex;
                const savedPos = savedPositions[track.videoId] || 0;
                return (
                  <div
                    key={`${track.videoId}-${idx}`}
                    className={`py-2.5 px-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                      isCurrent ? 'bg-amber-500/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <button
                      onClick={() => playTrackAtIndex(idx, true)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                    >
                      <TrackArtwork
                        src={track.thumbnailUrl}
                        alt={track.title}
                        isPlaying={isCurrent && isPlaying}
                        className="w-12 h-12 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium truncate ${
                            isCurrent ? 'text-amber-400 font-semibold' : 'text-slate-100'
                          }`}
                        >
                          {track.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 truncate font-mono-tabular">
                          <span className="font-sans truncate">{track.author}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDuration(track.durationSeconds)}</span>
                          {savedPos > 5 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-300/90">
                                Retomar {formatDuration(savedPos)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => setModalTrackForPlaylist(track)}
                        className="min-h-[44px] min-w-[40px] rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                        title="Añadir a lista"
                        aria-label="Añadir a lista"
                      >
                        <BookmarkPlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveQueueTrack(idx, 'up')}
                        disabled={idx === 0}
                        className="min-h-[44px] min-w-[38px] rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer"
                        title="Subir en la cola"
                        aria-label="Subir en la cola"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveQueueTrack(idx, 'down')}
                        disabled={idx === queue.length - 1}
                        className="min-h-[44px] min-w-[38px] rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-25 flex items-center justify-center transition-colors cursor-pointer"
                        title="Bajar en la cola"
                        aria-label="Bajar en la cola"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeQueueTrack(idx)}
                        className="min-h-[44px] min-w-[38px] rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                        title="Quitar de la cola"
                        aria-label="Quitar de la cola"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: SUBSCRIBED CHANNELS & NEW EPISODES SINCE LAST CONNECTION */}
          {activeTab === 'channels' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* Top Subscribe Bar (by Channel Name, @handle, or URL) + Refresh Feed */}
              <div className="p-3 sm:p-4 border-b border-white/[0.06] space-y-3 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubscribeByQuery(channelQuery);
                  }}
                  className="flex items-center gap-2"
                >
                  <div className="relative flex-1 flex items-center">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={channelQuery}
                      onChange={(e) => setChannelQuery(e.target.value)}
                      placeholder="Buscar canal, pegar @handle o URL (ej. @Veritasium, Lex Fridman)..."
                      className="w-full min-h-[42px] pl-9 pr-3.5 rounded-xl bg-[#090A0F] border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                      disabled={isSubscribingChannel}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubscribingChannel || !channelQuery.trim()}
                    className="min-h-[42px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isSubscribingChannel ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>Suscribirse</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshChannelsFeed}
                    disabled={isRefreshingFeed || subscriptions.length === 0}
                    className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-[#090A0F] border border-white/10 hover:border-amber-500/40 text-slate-300 hover:text-white flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                    title="Comprobar nuevos episodios en todos los canales"
                    aria-label="Actualizar feed de canales"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshingFeed ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                </form>

                {/* Horizontal Channel Filter Selector (Unified View Top + Filter by Channel) */}
                {subscriptions.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto custom-scroll pb-1">
                    <button
                      onClick={() => setSelectedChannelFilter('all')}
                      className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedChannelFilter === 'all'
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'bg-[#090A0F] border border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      <span>Todos</span>
                      <span className="font-mono-tabular opacity-80">
                        ({newCountByChannel.total} nuevos)
                      </span>
                    </button>

                    {subscriptions.map((ch) => {
                      const isSelected = selectedChannelFilter === ch.channelId;
                      const chNewCount = newCountByChannel.counts[ch.channelId] || 0;
                      return (
                        <button
                          key={ch.channelId}
                          onClick={() => setSelectedChannelFilter(ch.channelId)}
                          className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                <div className="px-4 py-2.5 bg-[#090A0F]/60 border-b border-white/[0.05] flex items-center justify-between gap-2 shrink-0">
                  {(() => {
                    const ch = subscriptions.find((c) => c.channelId === selectedChannelFilter);
                    if (!ch) return null;
                    return (
                      <>
                        <div className="min-w-0 flex items-center gap-2 text-xs text-slate-300">
                          <span className="font-semibold text-white truncate">{ch.name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-400 truncate">{ch.handle}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular text-slate-400">
                            {ch.episodes.length} episodios
                          </span>
                        </div>
                        <button
                          onClick={() => handleUnsubscribeChannel(ch.channelId, ch.name)}
                          className="min-h-[34px] px-2.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-white/5 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Dejar de seguir</span>
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Unified Chronological Episodes Feed */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 sm:p-4 divide-y divide-white/[0.05]">
                {displayedChannelEpisodes.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                    <Radio className="w-10 h-10 text-slate-600 mb-2" />
                    <p className="text-sm font-medium text-slate-300">
                      Sin canales suscritos todavía
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      Busca un canal arriba, pega su @handle o pulsa &ldquo;Suscribirse&rdquo; desde cualquier pista en reproducción para seguir nuevos episodios.
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
                        className={`py-2.5 px-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                          isNew ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.1]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <button
                          onClick={() => playSpecificTrack(ep, 0)}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                        >
                          <TrackArtwork
                            src={ep.thumbnailUrl}
                            alt={ep.title}
                            isPlaying={isCurrentlyPlaying}
                            className="w-12 h-12 rounded-xl"
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm truncate ${
                                isNew
                                  ? 'font-semibold text-white'
                                  : 'font-medium text-slate-200'
                              }`}
                            >
                              {ep.title}
                            </p>
                            {/* Zero-Pill Metadata with clean unboxed NUEVO indicator */}
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 truncate font-mono-tabular">
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

                        {/* Episode Quick Actions (>=44x44px hitboxes) */}
                        <div className="flex items-center gap-1 shrink-0">
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
                            className="min-h-[44px] min-w-[40px] rounded-lg text-slate-400 hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                            title="Añadir episodio a la cola"
                            aria-label="Añadir episodio a la cola"
                          >
                            <Plus className="w-4 h-4 text-amber-400" />
                          </button>

                          <button
                            onClick={() => setModalTrackForPlaylist(ep)}
                            className="min-h-[44px] min-w-[40px] rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition-colors cursor-pointer"
                            title="Guardar episodio en lista"
                            aria-label="Guardar episodio en lista"
                          >
                            <BookmarkPlus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM PLAYLISTS */}
          {activeTab === 'playlists' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-3 sm:p-4 border-b border-white/[0.06] space-y-3 shrink-0">
                <form onSubmit={handleCreatePlaylist} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPlaylistTitle}
                    onChange={(e) => setNewPlaylistTitle(e.target.value)}
                    placeholder="Nueva lista de reproducción (ej. Podcasts, Gym, Estudio)..."
                    className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-[#090A0F] border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={!newPlaylistTitle.trim()}
                    className="min-h-[42px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Lista</span>
                  </button>
                </form>

                {playlists.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto custom-scroll pb-1">
                    {playlists.map((pl) => {
                      const isSelected = activePlaylist?.id === pl.id;
                      return (
                        <button
                          key={pl.id}
                          onClick={() => setSelectedPlaylistId(pl.id)}
                          className={`min-h-[38px] px-3.5 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 sm:p-4">
                {!activePlaylist ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                    <ListMusic className="w-10 h-10 text-slate-600 mb-2" />
                    <p className="text-sm font-medium text-slate-300">No tienes listas creadas</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Crea tu primera lista arriba para organizar tus enlaces de YouTube.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.06]">
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold font-display text-white truncate">
                          {activePlaylist.name}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {activePlaylist.tracks.length}{' '}
                          {activePlaylist.tracks.length === 1 ? 'pista guardada' : 'pistas guardadas'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {currentTrack && (
                          <button
                            onClick={() =>
                              handleAddTrackToPlaylist(activePlaylist.id, currentTrack)
                            }
                            className="min-h-[40px] px-3 rounded-xl bg-[#090A0F] border border-white/10 hover:border-amber-500/40 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            title="Añadir la pista que está sonando a esta lista"
                          >
                            <Plus className="w-3.5 h-3.5 text-amber-400" />
                            <span>Añadir actual</span>
                          </button>
                        )}
                        <button
                          onClick={() => handlePlayEntirePlaylist(activePlaylist, 0)}
                          disabled={activePlaylist.tracks.length === 0}
                          className="min-h-[40px] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Reproducir lista</span>
                        </button>
                        <button
                          onClick={() => handleDeletePlaylist(activePlaylist.id)}
                          className="min-h-[40px] min-w-[40px] rounded-xl bg-[#090A0F] border border-white/10 hover:border-red-500/40 text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                          title="Eliminar lista"
                          aria-label="Eliminar lista"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {activePlaylist.tracks.length === 0 ? (
                      <div className="py-10 text-center text-slate-400">
                        <p className="text-xs">
                          Esta lista está vacía. Usa el botón &ldquo;Añadir actual&rdquo; o guarda cualquier pista desde el reproductor o la cola.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.05]">
                        {activePlaylist.tracks.map((track, idx) => (
                          <div
                            key={`${track.videoId}-${idx}`}
                            className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-white/[0.03] rounded-xl transition-colors"
                          >
                            <button
                              onClick={() => handlePlayEntirePlaylist(activePlaylist, idx)}
                              className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                            >
                              <TrackArtwork
                                src={track.thumbnailUrl}
                                alt={track.title}
                                className="w-11 h-11 rounded-xl"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-100 truncate">
                                  {track.title}
                                </p>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 font-mono-tabular">
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
                              className="min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                              title="Quitar de la lista"
                              aria-label="Quitar de la lista"
                            >
                              <Trash2 className="w-4 h-4" />
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
          {activeTab === 'history' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-3 sm:p-4 border-b border-white/[0.06] shrink-0">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Filtrar historial por título o canal..."
                    className="w-full min-h-[42px] pl-9 pr-3.5 rounded-xl bg-[#090A0F] border border-white/10 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scroll p-3 sm:p-4 divide-y divide-white/[0.05]">
                {filteredHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                    <History className="w-10 h-10 text-slate-600 mb-2" />
                    <p className="text-sm font-medium text-slate-300">Sin historial de escucha</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Las pistas de YouTube que reproduzcas aparecerán aquí automáticamente con su progreso guardado.
                    </p>
                  </div>
                ) : (
                  filteredHistory.map((item) => {
                    const resumeSec =
                      savedPositions[item.track.videoId] ?? item.lastPosition ?? 0;
                    return (
                      <div
                        key={item.id}
                        className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-white/[0.03] rounded-xl transition-colors"
                      >
                        <button
                          onClick={() => {
                            playSpecificTrack(item.track, resumeSec);
                            setActiveTab('player');
                          }}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                        >
                          <TrackArtwork
                            src={item.track.thumbnailUrl}
                            alt={item.track.title}
                            className="w-11 h-11 rounded-xl"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-100 truncate">
                              {item.track.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 font-mono-tabular truncate">
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
                            className="min-h-[44px] min-w-[44px] rounded-lg text-slate-400 hover:text-amber-400 flex items-center justify-center transition-colors cursor-pointer"
                            title="Guardar en lista"
                            aria-label="Guardar en lista"
                          >
                            <BookmarkPlus className="w-4 h-4" />
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

      {/* Mobile Mini-Player Bar when viewing Queue / Channels / Playlists / History tabs on mobile */}
      {activeTab !== 'player' && currentTrack && (
        <div className="lg:hidden px-3 py-2 bg-[#12151E] border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
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

      {/* Mobile Fixed Bottom Tab Bar (Natural Thumb Zone, 5 destinations, >=44px hitboxes) */}
      <nav
        className="lg:hidden h-14 bg-[#090A0F]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-5 items-center shrink-0 z-30"
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
