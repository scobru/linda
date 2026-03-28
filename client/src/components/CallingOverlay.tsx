import React, { useEffect, useRef } from 'react';
import type { CallStatus } from '../CallingService';

interface CallingOverlayProps {
  status: CallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  recipientProfile: { avatar?: string; nickname?: string } | null;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  video: boolean;
}

export const CallingOverlay: React.FC<CallingOverlayProps> = ({
  status,
  localStream,
  remoteStream,
  recipientProfile,
  onAccept,
  onReject,
  onEnd,
  video
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, status]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, status]);

  if (status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-black/80"></div>
      
      {/* Background/Remote Video */}
      {video && remoteStream && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${status === 'connected' ? 'opacity-60' : 'opacity-0'}`}
        />
      )}

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center gap-12 max-w-lg w-full px-6">
        
        {/* Profile Info */}
        <div className="flex flex-col items-center gap-6">
          <div className="avatar ring ring-primary ring-offset-black ring-offset-4 rounded-full shadow-2xl scale-110">
            <div className="w-32 rounded-full bg-base-300">
              <img src={recipientProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${recipientProfile?.nickname || 'call'}`} alt="Avatar" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-4xl font-black text-white tracking-tighter mb-2">{recipientProfile?.nickname || 'Unknown User'}</h2>
            <div className="flex items-center justify-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-success' : 'bg-primary animate-pulse'}`}></span>
              <p className="text-primary font-black uppercase tracking-[0.3em] text-[10px] opacity-80">
                {status === 'incoming' && 'In arrivo...'}
                {status === 'calling' && 'Chiamando...'}
                {status === 'connected' && 'Collegato'}
                {status === 'ended' && 'Connessione terminata'}
              </p>
            </div>
          </div>
        </div>

        {/* Local Video Preview (Small Overlay) */}
        {video && (status === 'connected' || status === 'calling') && (
          <div className="w-48 h-64 bg-base-300 rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 relative">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[8px] font-black uppercase text-white/60 tracking-wider">Tu</div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-8 pt-10">
          {status === 'incoming' ? (
            <>
              <button
                onClick={onReject}
                className="btn btn-circle btn-lg h-20 w-20 bg-error hover:bg-error/80 border-0 shadow-2xl shadow-error/40 text-white transition-transform active:scale-90"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={onAccept}
                className="btn btn-circle btn-lg h-24 w-24 bg-success hover:bg-success/80 border-0 shadow-2xl shadow-success/40 text-white scale-110 animate-bounce transition-transform active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-10 h-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={status === 'ended' ? onReject : onEnd}
              className={`btn btn-circle btn-lg h-20 w-20 bg-error hover:bg-error/80 border-0 shadow-2xl shadow-error/40 text-white transition-all active:scale-90 ${status === 'ended' ? 'opacity-50 grayscale' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8 rotate-[135deg]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </button>
          )}
        </div>
      </div>
{/* Premium Ripple Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/30 to-transparent animate-pulse scale-150"></div>
      </div>
    </div>
  );
};
