import React, { useState, useRef, useEffect } from 'react';

interface AudioRecorderProps {
  onRecordingComplete: (base64: string) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onRecordingComplete, onCancel }) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldSendRef = useRef<boolean>(true);

  useEffect(() => {
    let active = true;

    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;

        const supportedTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/aac',
          'audio/mp4',
          'audio/ogg',
        ];
        const mimeType = supportedTypes.find(type => 
          typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)
        ) || '';

        const recorderOptions = mimeType ? { mimeType } : undefined;
        const mediaRecorder = new MediaRecorder(stream, recorderOptions);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };

        mediaRecorder.onstop = () => {
          if (!shouldSendRef.current) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }

          const finalBlob = new Blob(chunksRef.current, { type: mimeType });
          if (finalBlob.size < 500) {
            console.warn("[AudioRecorder] Recording too short or empty, ignoring.");
            stream.getTracks().forEach(track => track.stop());
            onCancel();
            return;
          }

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = reader.result as string;
            onRecordingComplete(base64String);
          };
          reader.readAsDataURL(finalBlob);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(100);
        setRecordingTime(0);
        timerRef.current = setInterval(() => {
          setRecordingTime(t => t + 1);
        }, 1000);
      } catch (err) {
        console.error("Failed to start recording:", err);
        onCancel();
      }
    };

    startRecording();

    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleStopAndSend = () => {
    shouldSendRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleCancel = () => {
    shouldSendRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-4 w-full bg-error/10 border border-error/20 rounded-2xl p-2 px-4 shadow-lg backdrop-blur-md animate-fadeIn">
      <div className="flex items-center gap-3 flex-1">
        <div className="w-3 h-3 rounded-full bg-error animate-ping shrink-0" />
        <span className="text-sm font-black text-error uppercase tracking-widest font-mono">
          {formatTime(recordingTime)}
        </span>
        <span className="text-xs opacity-60 font-bold hidden sm:inline">
          Registrazione vocale in corso...
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCancel}
          className="btn btn-ghost btn-circle btn-sm hover:bg-error/20 text-error font-bold text-base"
          title="Annulla"
          aria-label="Annulla registrazione"
        >
          ✕
        </button>
        <button
          onClick={handleStopAndSend}
          className="btn btn-primary btn-sm rounded-xl px-4 font-bold gap-2 shadow-md"
          title="Invia vocale"
          aria-label="Invia vocale"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
          Invia
        </button>
      </div>
    </div>
  );
};
