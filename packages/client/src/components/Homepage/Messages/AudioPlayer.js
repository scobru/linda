import React, { useState, useRef, useEffect } from "react";

const AudioPlayer = ({ audioUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);

  useEffect(() => {
    console.log(
      "AudioPlayer - URL ricevuto:",
      audioUrl?.substring(0, 100) + "..."
    );
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
      setIsLoaded(true);
      console.log("Audio caricato con successo, durata:", audio.duration);
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const handleError = (e) => {
      console.error("Errore caricamento audio:", e);
      setIsLoaded(false);
    };

    // Eventi audio
    audio.addEventListener("loadeddata", setAudioData);
    audio.addEventListener("timeupdate", setAudioTime);
    audio.addEventListener("ended", () => setIsPlaying(false));
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadeddata", setAudioData);
      audio.removeEventListener("timeupdate", setAudioTime);
      audio.removeEventListener("ended", () => setIsPlaying(false));
      audio.removeEventListener("error", handleError);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current || !isLoaded) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          console.log("Riproduzione audio avviata");
        })
        .catch((error) => {
          console.error("Errore riproduzione audio:", error);
          setIsPlaying(false);
        });
    }
  };

  const stopAudio = () => {
    if (!audioRef.current) return;

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
  };

  const handleProgressChange = (e) => {
    if (!audioRef.current) return;

    const time =
      (e.nativeEvent.offsetX / progressBarRef.current.offsetWidth) * duration;
    audioRef.current.currentTime = time;
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return "0:00";

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col w-full max-w-[300px] bg-[#2D325A] rounded-lg p-2">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadStart={() => console.log("Inizio caricamento audio")}
      />

      {/* Controlli */}
      <div className="flex items-center space-x-2 mb-1">
        <button
          onClick={togglePlay}
          disabled={!isLoaded}
          className={`p-2 rounded-full ${
            isLoaded
              ? "hover:bg-[#4A4F76] text-white"
              : "text-gray-400 cursor-not-allowed"
          } transition-colors`}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>

        <button
          onClick={stopAudio}
          className="p-2 rounded-full hover:bg-[#4A4F76] text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="text-xs text-gray-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Barra di progresso */}
      <div
        ref={progressBarRef}
        onClick={handleProgressChange}
        className={`h-1 ${
          isLoaded ? "bg-[#4A4F76]" : "bg-gray-600"
        } rounded-full cursor-pointer`}
      >
        <div
          className="h-full bg-blue-500 rounded-full"
          style={{
            width: `${(currentTime / duration) * 100 || 0}%`,
          }}
        />
      </div>
    </div>
  );
};

export default AudioPlayer;
