import React, { useRef, useState, useEffect } from "react";
import { messaging } from "#protocol";

export const VoiceMessage = ({ content, isOwnMessage, selected }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [audioContent, setAudioContent] = useState(content);

  useEffect(() => {
    const decryptContent = async () => {
      if (selected?.type === "friend" && content.startsWith("SEA{")) {
        try {
          const decrypted = await messaging.chat.messageList.decryptMessage(
            { content },
            selected.pub
          );
          setAudioContent(decrypted.content);
        } catch (error) {
          console.error("Errore decrittazione audio:", error);
        }
      } else {
        setAudioContent(content);
      }
    };

    decryptContent();
  }, [content, selected]);

  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

    const handleLoadedMetadata = () => {
      if (audio) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const handleTimeUpdate = () => {
      if (audio) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      if (audio) {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("ended", handleEnded);
      }
    };
  }, [audioContent]);

  const togglePlay = () => {
    if (!audioRef.current || !isLoaded) return;

    if (audioRef.current.paused) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((error) => {
          console.error("Errore riproduzione audio:", error);
          setIsPlaying(false);
        });
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (time) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`flex items-center space-x-2 ${
        isOwnMessage ? "justify-end" : "justify-start"
      }`}
    >
      <audio ref={audioRef} src={audioContent} preload="metadata" />
      <button
        onClick={togglePlay}
        disabled={!isLoaded}
        className={`p-2 rounded-full ${
          isLoaded ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-400"
        } text-white`}
      >
        {isPlaying ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      <div className="flex flex-col">
        <div className="text-xs text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="w-32 h-1 bg-gray-200 rounded">
          <div
            className="h-full bg-blue-500 rounded"
            style={{
              width: `${isLoaded ? (currentTime / duration) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
