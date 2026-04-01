import React, { useState, useEffect } from 'react';
import type { FileMetadata } from '../hooks/useSignalMessaging';
import type { TransferStatus } from '../FileTransferService';

interface FileBubbleProps {
  metadata: FileMetadata;
  isMe: boolean;
  onAccept: () => void;
  progress: number;
  status: TransferStatus;
  blob?: Blob | null;
}

export const FileBubble: React.FC<FileBubbleProps> = ({
  metadata,
  isMe,
  onAccept,
  progress,
  status,
  blob
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob && metadata.mimeType.startsWith('image/')) {
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [blob, metadata.mimeType]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const isImage = metadata.mimeType.startsWith('image/');

  return (
    <div className={`flex flex-col gap-2 max-w-sm rounded-2xl p-3 ${isMe ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content'} shadow-lg border border-white/5`}>
      {isImage && (previewUrl || isMe) ? (
        <div className="relative rounded-lg overflow-hidden bg-black/20 min-h-[100px] flex items-center justify-center">
            {previewUrl ? (
                <img src={previewUrl} alt={metadata.name} className="max-w-full h-auto object-cover" />
            ) : isMe ? (
                 <div className="text-xs opacity-50 italic">Image Sent</div>
            ) : (
                <div className="loading loading-spinner loading-md text-primary"></div>
            )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center flex-shrink-0">
            {isImage ? '🖼️' : '📄'}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="font-bold text-sm truncate">{metadata.name}</div>
            <div className="text-xs opacity-70">{formatSize(metadata.size)}</div>
          </div>
        </div>
      )}

      {status === 'transferring' && (
        <div className="w-full mt-2">
          <div className="flex justify-between text-[10px] mb-1 opacity-70">
            <span>Transferring...</span>
            <span>{Math.round((progress / metadata.size) * 100)}%</span>
          </div>
          <progress className="progress progress-primary w-full h-1.5" value={progress} max={metadata.size}></progress>
        </div>
      )}

      {!isMe && status === 'incoming' && (!isImage || !blob) && (
        <button onClick={onAccept} className="btn btn-sm btn-primary gap-2 mt-1 shadow-lg shadow-primary/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {isImage ? 'Accept Image' : 'Accept File'}
        </button>
      )}

      {!isMe && (status === 'idle' || status === 'offered' || status === 'signaling') && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-center gap-2 px-3 py-2 bg-black/10 rounded-xl border border-white/5 animate-pulse">
              <div className="loading loading-spinner loading-xs opacity-50"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                {status === 'signaling' ? 'Connecting...' : 'Waiting for offer...'}
              </span>
          </div>
          {(status === 'idle' || status === 'offered') && (
            <button 
              onClick={onAccept}
              className="btn btn-xs btn-ghost text-[10px] opacity-30 hover:opacity-100"
            >
              Force Accept (Try anyway)
            </button>
          )}
        </div>
      )}

      {isMe && (status === 'offering' || status === 'signaling') && (
        <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-black/10 rounded-xl border border-white/5 animate-pulse">
            <div className="loading loading-spinner loading-xs opacity-50"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">
              {status === 'signaling' ? 'Connecting...' : 'Preparing transfer...'}
            </span>
        </div>
      )}

      {status === 'completed' && blob && (
        <a 
          href={URL.createObjectURL(blob)} 
          download={metadata.name}
          className="btn btn-sm btn-success gap-2 mt-1 no-animation"
        >
          Download / Save
        </a>
      )}

      {status === 'failed' && (
        <div className="text-error text-xs mt-1 font-bold italic">Transfer Failed</div>
      )}
    </div>
  );
};
