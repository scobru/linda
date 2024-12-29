import React, { useState, useRef } from "react";
import { AiOutlineSend } from "react-icons/ai";
import { toast } from "react-hot-toast";

const InputArea = ({ onSendMessage }) => {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      console.log("Tentativo di invio messaggio:", message);
      await onSendMessage(message.trim(), "text");
      setMessage("");
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error("Errore nell'invio del messaggio");
    }
  };

  const startRecording = async () => {
    try {
      console.log("Avvio registrazione audio");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        try {
          console.log("Registrazione completata, preparazione blob");
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
          await onSendMessage(audioBlob, "audio");
          stream.getTracks().forEach((track) => track.stop());
        } catch (error) {
          console.error("Errore invio messaggio vocale:", error);
          toast.error("Errore nell'invio del messaggio vocale");
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Errore accesso microfono:", error);
      toast.error("Errore nell'accesso al microfono");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log("Arresto registrazione");
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="p-3 bg-[#373B5C] border-t border-[#4A4F76]">
      <div className="flex items-center space-x-2 bg-[#2D325A] rounded-full px-4 py-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="Scrivi un messaggio..."
          className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none"
          disabled={isRecording}
        />

        {!isRecording ? (
          <>
            <button
              onClick={startRecording}
              className="p-2 rounded-full text-white hover:bg-[#4A4F76] transition-colors"
              title="Registra messaggio vocale"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!message.trim()}
              className={`p-2 rounded-full text-white transition-colors ${
                !message.trim()
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-[#4A4F76]"
              }`}
              title="Invia messaggio"
            >
              <AiOutlineSend className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button
            onClick={stopRecording}
            className="p-2 rounded-full text-red-500 hover:bg-[#4A4F76] animate-pulse"
            title="Ferma registrazione"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default InputArea;
