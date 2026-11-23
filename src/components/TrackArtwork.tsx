import React, { useEffect, useMemo, useState } from 'react';
import { Disc3 } from 'lucide-react';

interface TrackArtworkProps {
  src: string;
  alt: string;
  videoId?: string;
  variant?: 'thumbnail' | 'hero';
  className?: string;
  isPlaying?: boolean;
}

function extractYouTubeIdFromUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/vi(?:_webp)?\/([a-zA-Z0-9_-]{11})\//);
  return match ? match[1] : null;
}

export const TrackArtwork: React.FC<TrackArtworkProps> = ({
  src,
  alt,
  videoId,
  variant = 'thumbnail',
  className = 'w-12 h-12 rounded-xl',
  isPlaying = false,
}) => {
  const resolvedVideoId = useMemo(
    () => videoId || extractYouTubeIdFromUrl(src),
    [videoId, src]
  );

  const candidates = useMemo(() => {
    const list: string[] = [];
    if (variant === 'hero' && resolvedVideoId) {
      list.push(`https://i.ytimg.com/vi/${resolvedVideoId}/maxresdefault.jpg`);
      list.push(`https://i.ytimg.com/vi/${resolvedVideoId}/sddefault.jpg`);
      list.push(`https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`);
    }
    if (src && !list.includes(src)) {
      list.push(src);
    }
    if (resolvedVideoId && list.length === 0) {
      list.push(`https://i.ytimg.com/vi/${resolvedVideoId}/hqdefault.jpg`);
    }
    return list;
  }, [variant, resolvedVideoId, src]);

  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setHasError(false);
  }, [candidates]);

  const activeSrc = candidates[candidateIndex] || '';

  const handleAdvanceCandidate = () => {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setHasError(true);
    }
  };

  if (!activeSrc || hasError) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-[#1A1F2E] via-[#12151E] to-[#090A0F] border border-white/10 flex flex-col items-center justify-center text-amber-400/80 select-none overflow-hidden shrink-0`}
        role="img"
        aria-label={alt}
      >
        <Disc3
          className={`${variant === 'hero' ? 'w-16 h-16' : 'w-1/2 h-1/2'} ${
            isPlaying ? 'animate-spin' : ''
          } text-amber-400/70`}
          style={{ animationDuration: '8s' }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${className} relative overflow-hidden bg-[#0D1017] border border-white/10 shrink-0`}
    >
      {variant === 'hero' && (
        <img
          src={activeSrc}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40 pointer-events-none select-none"
        />
      )}
      <img
        src={activeSrc}
        alt={alt}
        referrerPolicy="no-referrer"
        onLoad={(e) => {
          // YouTube returns a 120x90 fallback stub when maxresdefault/sddefault is missing
          if (
            e.currentTarget.naturalWidth <= 120 &&
            candidateIndex + 1 < candidates.length
          ) {
            handleAdvanceCandidate();
          }
        }}
        onError={handleAdvanceCandidate}
        className={`relative z-10 w-full h-full object-cover ${
          variant === 'hero'
            ? 'transition-transform duration-700 ease-out group-hover:scale-[1.02]'
            : ''
        }`}
      />
      {variant === 'hero' && (
        <div className="pointer-events-none absolute inset-0 z-20 ring-1 ring-inset ring-white/15 bg-gradient-to-t from-[#090A0F]/65 via-transparent to-black/25" />
      )}
    </div>
  );
};
