import React, { useState, useRef, useCallback } from "react";

export const InputArea = ({ onSendMessage, onVoiceMessage, disabled }) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Gestione invio messaggio testuale
  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage("");
    }
  };

  // Gestione registrazione audio
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        onVoiceMessage(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Avvia timer
      let time = 0;
      timerRef.current = setInterval(() => {
        time += 1;
        setRecordingTime(time);
      }, 1000);
    } catch (error) {
      console.error("Errore accesso microfono:", error);
    }
  }, [onVoiceMessage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      setRecordingTime(0);
    }
  }, [isRecording]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center px-4 py-3 bg-[#373B5C] border-t border-[#4A4F76]"
    >
      {isRecording ? (
        <div className="flex-1 flex items-center">
          <div className="animate-pulse text-red-500 mr-2">●</div>
          <span className="text-white">{formatTime(recordingTime)}</span>
          <button
            type="button"
            onClick={stopRecording}
            className="ml-auto text-white hover:text-gray-300"
          >
            Stop
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Scrivi un messaggio..."
            disabled={disabled}
            className="flex-1 bg-[#4A4F76] text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {message.trim() ? (
            <button
              type="submit"
              disabled={disabled}
              className="ml-2 text-white hover:text-gray-300 disabled:opacity-50"
            >
              Invia
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="ml-2 text-white hover:text-gray-300 disabled:opacity-50"
            >
              🎤
            </button>
          )}
        </>
      )}
    </form>
  );
};
