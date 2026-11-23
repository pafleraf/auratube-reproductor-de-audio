import { SubscribedChannel, Track } from '../types';

export function extractYouTubeIdClient(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length >= 2 && ['shorts', 'live', 'embed', 'v'].includes(segments[0])) {
        const candidate = segments[1];
        if (/^[a-zA-Z0-9_-]{11}$/.test(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // fallback regex
  }
  const match = trimmed.match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Hace unos segundos';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Hace ${diffHr} h`;
  const diffDays = Math.floor(diffHr / 24);
  return `Hace ${diffDays} d`;
}

export async function resolveYouTubeTrack(urlOrId: string): Promise<Track> {
  const response = await fetch(`/api/youtube/info?url=${encodeURIComponent(urlOrId.trim())}`);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'No se pudo resolver el enlace de YouTube');
  }
  const data = await response.json();
  return {
    videoId: data.videoId,
    url: data.url,
    title: data.title,
    author: data.author,
    channelId: data.channelId,
    durationSeconds: data.durationSeconds || 240,
    thumbnailUrl: data.thumbnailUrl,
    audioStreamUrl: data.audioStreamUrl || `/api/youtube/stream?id=${data.videoId}&duration=${data.durationSeconds || 240}`,
    addedAt: Date.now(),
  };
}

export async function resolveYouTubeChannelFeed(queryOrUrl: string): Promise<SubscribedChannel> {
  const response = await fetch(`/api/youtube/channel/feed?query=${encodeURIComponent(queryOrUrl.trim())}`);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'No se pudo encontrar el canal de YouTube');
  }
  return response.json();
}

export const INITIAL_SUGGESTED_TRACKS: Track[] = [
  {
    videoId: 'jfKfPfyJRdk',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    title: 'lofi hip hop radio — beats to relax/study to',
    author: 'Lofi Girl',
    channelId: 'ch-lofigirl',
    durationSeconds: 360,
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=jfKfPfyJRdk&duration=360',
    addedAt: Date.now() - 3600 * 1000,
  },
  {
    videoId: 'DWcJFNfaw9c',
    url: 'https://www.youtube.com/watch?v=DWcJFNfaw9c',
    title: 'Ambient Space Music — Deep Focus & Coding Session',
    author: 'Chillhop Music',
    channelId: 'ch-chillhop',
    durationSeconds: 420,
    thumbnailUrl: 'https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=DWcJFNfaw9c&duration=420',
    addedAt: Date.now() - 7200 * 1000,
  },
  {
    videoId: '5qap5aO4i9A',
    url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
    title: 'Late Night Synthwave & Chill Beats Mix',
    author: 'Lofi Girl',
    channelId: 'ch-lofigirl',
    durationSeconds: 300,
    thumbnailUrl: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=5qap5aO4i9A&duration=300',
    addedAt: Date.now() - 10800 * 1000,
  },
  {
    videoId: 'rUxyKA_-grg',
    url: 'https://www.youtube.com/watch?v=rUxyKA_-grg',
    title: 'Deep Focus Acoustic & Piano — Nocturnal Study',
    author: 'Quietude Audio',
    channelId: 'ch-quietude',
    durationSeconds: 340,
    thumbnailUrl: 'https://i.ytimg.com/vi/rUxyKA_-grg/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=rUxyKA_-grg&duration=340',
    addedAt: Date.now() - 14400 * 1000,
  },
];

export const INITIAL_SUBSCRIBED_CHANNELS: SubscribedChannel[] = [
  {
    channelId: 'ch-lofigirl',
    name: 'Lofi Girl',
    handle: '@LofiGirl',
    avatarUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    subscribedAt: Date.now() - 86400 * 1000 * 3,
    lastCheckedAt: Date.now() - 3600 * 1000 * 5,
    episodes: [
      {
        videoId: 'jfKfPfyJRdk',
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
        title: 'lofi hip hop radio — beats to relax/study to',
        author: 'Lofi Girl',
        channelId: 'ch-lofigirl',
        channelName: 'Lofi Girl',
        durationSeconds: 360,
        thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=jfKfPfyJRdk&duration=360',
        addedAt: Date.now() - 1800 * 1000,
        publishedAt: Date.now() - 1800 * 1000, // Nuevo desde la última conexión
      },
      {
        videoId: '4xDzrJKXOOY',
        url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY',
        title: 'synthwave radio — chill & retro beats to code/game to',
        author: 'Lofi Girl',
        channelId: 'ch-lofigirl',
        channelName: 'Lofi Girl',
        durationSeconds: 390,
        thumbnailUrl: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=4xDzrJKXOOY&duration=390',
        addedAt: Date.now() - 5400 * 1000,
        publishedAt: Date.now() - 5400 * 1000, // Nuevo desde la última conexión
      },
      {
        videoId: '5qap5aO4i9A',
        url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
        title: 'Late Night Study & Ambient Vinyl Sessions',
        author: 'Lofi Girl',
        channelId: 'ch-lofigirl',
        channelName: 'Lofi Girl',
        durationSeconds: 300,
        thumbnailUrl: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=5qap5aO4i9A&duration=300',
        addedAt: Date.now() - 86400 * 1000 * 2,
        publishedAt: Date.now() - 86400 * 1000 * 2,
      },
    ],
  },
  {
    channelId: 'ch-chillhop',
    name: 'Chillhop Music',
    handle: '@ChillhopMusic',
    avatarUrl: 'https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg',
    subscribedAt: Date.now() - 86400 * 1000 * 5,
    lastCheckedAt: Date.now() - 3600 * 1000 * 6,
    episodes: [
      {
        videoId: '7NOSDKb0HlU',
        url: 'https://www.youtube.com/watch?v=7NOSDKb0HlU',
        title: 'Chillhop Essentials — Nocturnal Jazz & Instrumental Beats',
        author: 'Chillhop Music',
        channelId: 'ch-chillhop',
        channelName: 'Chillhop Music',
        durationSeconds: 410,
        thumbnailUrl: 'https://i.ytimg.com/vi/7NOSDKb0HlU/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=7NOSDKb0HlU&duration=410',
        addedAt: Date.now() - 3200 * 1000,
        publishedAt: Date.now() - 3200 * 1000, // Nuevo desde la última conexión
      },
      {
        videoId: 'DWcJFNfaw9c',
        url: 'https://www.youtube.com/watch?v=DWcJFNfaw9c',
        title: 'Ambient Space Music — Deep Focus & Coding Session',
        author: 'Chillhop Music',
        channelId: 'ch-chillhop',
        channelName: 'Chillhop Music',
        durationSeconds: 420,
        thumbnailUrl: 'https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=DWcJFNfaw9c&duration=420',
        addedAt: Date.now() - 86400 * 1000 * 3,
        publishedAt: Date.now() - 86400 * 1000 * 3,
      },
    ],
  },
];
