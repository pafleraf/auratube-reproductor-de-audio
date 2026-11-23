import React, { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface TrackArtworkProps {
  src: string;
  alt: string;
  className?: string;
  isPlaying?: boolean;
}

export const TrackArtwork: React.FC<TrackArtworkProps> = ({
  src,
  alt,
  className = 'w-12 h-12 rounded-xl',
  isPlaying = false,
}) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`${className} bg-gradient-to-br from-[#1A1F2E] to-[#0D1017] border border-white/10 flex flex-col items-center justify-center text-amber-400/80 select-none overflow-hidden shrink-0`}
        role="img"
        aria-label={alt}
      >
        <Disc3 className={`w-1/2 h-1/2 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '8s' }} />
      </div>
    );
  }

  return (
    <div className={`${className} relative overflow-hidden bg-[#12151E] border border-white/10 shrink-0`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
};
