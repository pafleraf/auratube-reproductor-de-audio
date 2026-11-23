export interface Track {
  videoId: string;
  url: string;
  title: string;
  author: string;
  channelId?: string;
  durationSeconds: number;
  thumbnailUrl: string;
  audioStreamUrl?: string;
  sourceMode?: 'direct' | 'proxy' | 'synth';
  addedAt: number;
  lastPosition?: number;
  publishedAt?: number;
}

export interface ChannelEpisode extends Track {
  channelId: string;
  channelName: string;
  publishedAt: number;
}

export interface SubscribedChannel {
  channelId: string;
  name: string;
  handle: string;
  avatarUrl: string;
  subscribedAt: number;
  lastCheckedAt: number;
  episodes: ChannelEpisode[];
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  tracks: Track[];
}

export interface HistoryItem {
  id: string;
  track: Track;
  playedAt: number;
  lastPosition: number;
}

export type ActiveTab = 'player' | 'queue' | 'channels' | 'playlists' | 'history';

export type RepeatMode = 'off' | 'all' | 'one';
