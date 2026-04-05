import React, { useState, useRef, useEffect } from "react";

interface AudioPlayerProps {
  src: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // Some browsers return Infinity or 0 for duration of certain blobs
    // until we seek to the end or start playing.
    if (!isFinite(audio.duration) || audio.duration === 0) {
      audio.currentTime = 1e101;
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null;
        if (isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
        audio.currentTime = 0;
      };
    } else {
      setDuration(audio.duration);
    }
  };

  const onDurationChange = () => {
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
  };

  const onCanPlayThrough = () => {
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
  };

  // Polling fallback for duration
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const checkDuration = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
        return true;
      }
      return false;
    };

    if (!checkDuration()) {
      const interval = setInterval(() => {
        if (checkDuration()) clearInterval(interval);
      }, 500);
      
      const timeout = setTimeout(() => clearInterval(interval), 5000);
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [src]);

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
      } else {
        await audio.play();
      }
      setIsPlaying(!isPlaying);
    } catch (err) {
      console.error("[AudioPlayer] Playback error:", err);
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <div className="flex flex-col gap-2 w-full max-w-[240px] bg-black/20 backdrop-blur-md rounded-2xl p-3 border border-white/10 shadow-xl group transition-all hover:bg-black/30">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onDurationChange}
        onCanPlayThrough={onCanPlayThrough}
        onTimeUpdate={onTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        hidden
      />
      
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="btn btn-circle btn-sm bg-primary text-primary-content border-none hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4 ml-0.5">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Info & Progress */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between items-center px-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
              VOICE MESSAGE
            </span>
            <span className="text-[10px] font-bold opacity-40">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleProgressChange}
            className="range range-xs range-primary h-1 bg-white/10 rounded-full cursor-pointer appearance-none"
            style={{
              background: `linear-gradient(to right, hsl(var(--p)) ${(currentTime / duration) * 100}%, rgba(255,255,255,0.1) ${(currentTime / duration) * 100}%)`,
            }}
          />
        </div>
      </div>
      
      {/* Waveform-like Visualizer (Static SVG for decoration) */}
      <div className="flex items-end justify-between px-2 h-4 opacity-20 group-hover:opacity-40 transition-opacity">
        {[2, 4, 3, 6, 8, 5, 7, 3, 4, 2, 5, 8, 6, 4, 3, 5, 7, 2].map((h, i) => (
          <div
            key={i}
            className={`w-0.5 bg-current rounded-full transition-all duration-300 ${isPlaying ? 'animate-pulse' : ''}`}
            style={{ height: `${h * 10}%`, transitionDelay: `${i * 50}ms` }}
          />
        ))}
      </div>
    </div>
  );
};
