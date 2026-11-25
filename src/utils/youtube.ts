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
    videoId: 'AodSJJ-ZvuI',
    url: 'https://www.youtube.com/watch?v=AodSJJ-ZvuI',
    title: 'Chillhop Sanctuary ❄️ [cozy beats / winter lofi mix]',
    author: 'Chillhop Music',
    channelId: 'UCOxqgCwgOqC2lMqC5PYz_Dg',
    durationSeconds: 3600,
    thumbnailUrl: 'https://i.ytimg.com/vi/AodSJJ-ZvuI/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=AodSJJ-ZvuI&duration=3600',
    addedAt: Date.now() - 1800 * 1000,
  },
  {
    videoId: '34GOO-dOZNU',
    url: 'https://www.youtube.com/watch?v=34GOO-dOZNU',
    title: 'Forest Retreat 🌳 [lofi beats / chillhop x planet wild]',
    author: 'Chillhop Music',
    channelId: 'UCOxqgCwgOqC2lMqC5PYz_Dg',
    durationSeconds: 3600,
    thumbnailUrl: 'https://i.ytimg.com/vi/34GOO-dOZNU/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=34GOO-dOZNU&duration=3600',
    addedAt: Date.now() - 3600 * 1000,
  },
  {
    videoId: 'q0fBw_zgcCk',
    url: 'https://www.youtube.com/watch?v=q0fBw_zgcCk',
    title: 'Days are getting shorter, jackets are getting thicker, and Essentials Winter 2026 drops December 1❄️',
    author: 'Chillhop Music',
    channelId: 'UCOxqgCwgOqC2lMqC5PYz_Dg',
    durationSeconds: 60,
    thumbnailUrl: 'https://i.ytimg.com/vi/q0fBw_zgcCk/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=q0fBw_zgcCk&duration=60',
    addedAt: Date.now() - 7200 * 1000,
  },
  {
    videoId: 'jfKfPfyJRdk',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    title: 'lofi hip hop radio — beats to relax/study to',
    author: 'Lofi Girl',
    channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
    durationSeconds: 360,
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    audioStreamUrl: '/api/youtube/stream?id=jfKfPfyJRdk&duration=360',
    addedAt: Date.now() - 10800 * 1000,
  },
];

export const INITIAL_SUBSCRIBED_CHANNELS: SubscribedChannel[] = [
  {
    channelId: 'UCOxqgCwgOqC2lMqC5PYz_Dg',
    name: 'Chillhop Music',
    handle: '@ChillhopMusic',
    avatarUrl: 'https://i.ytimg.com/vi/AodSJJ-ZvuI/hqdefault.jpg',
    subscribedAt: Date.now() - 86400 * 1000 * 5,
    lastCheckedAt: Date.now() - 3600 * 1000 * 4,
    episodes: [
      {
        videoId: 'AodSJJ-ZvuI',
        url: 'https://www.youtube.com/watch?v=AodSJJ-ZvuI',
        title: 'Chillhop Sanctuary ❄️ [cozy beats / winter lofi mix]',
        author: 'Chillhop Music',
        channelId: 'UCOxqgCwgOqC2lMqC5PYz_Dg',
        channelName: 'Chillhop Music',
        durationSeconds: 3600,
        thumbnailUrl: 'https://i.ytimg.com/vi/AodSJJ-ZvuI/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=AodSJJ-ZvuI&duration=3600',
        addedAt: Date.now() - 1800 * 1000,
        publishedAt: Date.now() - 1800 * 1000,
      },
      {
        videoId: 'q0fBw_zgcCk',
        url: 'https://www.youtube.com/watch?v=q0fBw_zgcCk',
        title: 'Days are getting shorter, jackets are getting thicker, and Essentials Winter 2026 drops December 1❄️',
        author: 'Chillhop Music',
        channelId: 'UCOxqgCwgOqC2lMqC5PYz_Dg',
        channelName: 'Chillhop Music',
        durationSeconds: 60,
        thumbnailUrl: 'https://i.ytimg.com/vi/q0fBw_zgcCk/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=q0fBw_zgcCk&duration=60',
        addedAt: Date.now() - 3200 * 1000,
        publishedAt: Date.now() - 3200 * 1000,
      },
      {
        videoId: '34GOO-dOZNU',
        url: 'https://www.youtube.com/watch?v=34GOO-dOZNU',
        title: 'Forest Retreat 🌳 [lofi beats / chillhop x planet wild]',
        author: 'Chillhop Music',
        channelId: 'UCOxqgCwgOqC2lMqC5PYz_Dg',
        channelName: 'Chillhop Music',
        durationSeconds: 3600,
        thumbnailUrl: 'https://i.ytimg.com/vi/34GOO-dOZNU/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=34GOO-dOZNU&duration=3600',
        addedAt: Date.now() - 86400 * 1000 * 2,
        publishedAt: Date.now() - 86400 * 1000 * 2,
      },
    ],
  },
  {
    channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
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
        channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
        channelName: 'Lofi Girl',
        durationSeconds: 360,
        thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=jfKfPfyJRdk&duration=360',
        addedAt: Date.now() - 5400 * 1000,
        publishedAt: Date.now() - 5400 * 1000,
      },
      {
        videoId: '4xDzrJKXOOY',
        url: 'https://www.youtube.com/watch?v=4xDzrJKXOOY',
        title: 'synthwave radio — chill & retro beats to code/game to',
        author: 'Lofi Girl',
        channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
        channelName: 'Lofi Girl',
        durationSeconds: 390,
        thumbnailUrl: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg',
        audioStreamUrl: '/api/youtube/stream?id=4xDzrJKXOOY&duration=390',
        addedAt: Date.now() - 86400 * 1000 * 2,
        publishedAt: Date.now() - 86400 * 1000 * 2,
      },
    ],
  },
];
