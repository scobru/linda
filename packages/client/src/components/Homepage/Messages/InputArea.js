import React, { useState, useRef } from "react";
import { AiOutlineSend } from "react-icons/ai";
import { BsMicFill, BsStopFill, BsImage } from "react-icons/bs";
import { toast } from "react-hot-toast";

const InputArea = ({ onSendMessage, newMessage, setNewMessage }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim()) {
        onSendMessage(newMessage, "text");
        setNewMessage("");
      }
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      onSendMessage(newMessage, "text");
      setNewMessage("");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await onSendMessage(audioBlob, "audio");
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Avvia il timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Errore accesso microfono:", error);
      toast.error("Errore nell'accesso al microfono");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      setRecordingTime(0);
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'immagine non può superare i 5MB");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        await onSendMessage(reader.result, "image");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Errore caricamento immagine:", error);
      toast.error("Errore nel caricamento dell'immagine");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-3 bg-[#373B5C] border-t border-[#4A4F76]">
      <div className="flex items-center space-x-2 bg-[#2D325A] rounded-full px-4 py-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio..."
          className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none"
          disabled={isRecording}
          autoComplete="off"
          spellCheck="true"
        />

        <div className="flex items-center space-x-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current.click()}
            className="p-2 rounded-full text-white hover:bg-[#4A4F76] transition-colors"
            title="Invia immagine"
            type="button"
          >
            <BsImage className="w-5 h-5" />
          </button>

          {!isRecording ? (
            <button
              onClick={startRecording}
              className="p-2 rounded-full text-white hover:bg-[#4A4F76] transition-colors"
              title="Registra messaggio vocale"
              type="button"
            >
              <BsMicFill className="w-5 h-5" />
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-red-500 animate-pulse">
                {formatTime(recordingTime)}
              </span>
              <button
                onClick={stopRecording}
                className="p-2 rounded-full text-red-500 hover:bg-[#4A4F76] transition-colors"
                title="Ferma registrazione"
                type="button"
              >
                <BsStopFill className="w-5 h-5" />
              </button>
            </div>
          )}

          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isRecording}
            className={`p-2 rounded-full text-white transition-colors ${
              !newMessage.trim() || isRecording
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-[#4A4F76]"
            }`}
            title="Invia messaggio"
            type="button"
          >
            <AiOutlineSend className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InputArea;
