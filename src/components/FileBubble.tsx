import React, { useState, useEffect } from 'react';
import type { FileMetadata } from '../hooks/useMessaging';

interface FileBubbleProps {
  metadata: FileMetadata;
  isMe: boolean;
  isCloud?: boolean;
  onAccept: () => void;
  progress: number;
  status: string;
  wormholeStatus?: string;
  blob?: Blob | null;
}

export const FileBubble: React.FC<FileBubbleProps> = ({
  metadata,
  isMe,
  isCloud = false,
  onAccept,
  progress,
  status,
  wormholeStatus,
  blob
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setBlobUrl(null);
      };
    }
  }, [blob]);

  const previewUrl = metadata.mimeType.startsWith('image/') ? blobUrl : null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const isImage = metadata.mimeType.startsWith('image/');

  return (
    <div className={`flex flex-col gap-2 w-full max-w-[240px] xs:max-w-[280px] sm:max-w-sm rounded-2xl p-3 ${isMe ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content'} shadow-lg border border-white/5 overflow-hidden`}>
      {isImage && (previewUrl || isMe) ? (
        <div className="flex flex-col gap-1.5 w-full">
          <div className="relative rounded-lg overflow-hidden bg-black/20 min-h-[100px] flex items-center justify-center w-full">
              {previewUrl ? (
                  <img src={previewUrl} alt={metadata.name} className="max-w-full max-h-72 h-auto object-cover rounded-lg" />
              ) : isMe ? (
                   <div className="text-xs opacity-50 italic">Image Sent</div>
              ) : (
                  <div className="loading loading-spinner loading-md text-primary"></div>
              )}
          </div>
          <div className="font-bold text-xs truncate max-w-full opacity-80 px-1" title={metadata.name}>
            {metadata.name}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 w-full min-w-0">
          <div className="w-11 h-11 rounded-xl bg-black/20 flex items-center justify-center flex-shrink-0">
            {isImage ? '🖼️' : '📄'}
          </div>
          <div className="flex-1 overflow-hidden min-w-0">
            <div className="font-bold text-sm truncate max-w-full" title={metadata.name}>{metadata.name}</div>
            <div className="text-xs opacity-70">{formatSize(metadata.size)}</div>
          </div>
        </div>
      )}

      {(metadata.method === 'wormhole' && wormholeStatus === 'downloading') && (
        <div className="w-full mt-2">
          <div className="flex justify-between text-[10px] mb-1 opacity-70">
            <span>Downloading...</span>
            <span>{progress}%</span>
          </div>
          <progress className="progress progress-primary w-full h-1.5" value={progress} max={100}></progress>
        </div>
      )}

      {(!isMe || isCloud) && (metadata.method === 'wormhole' && status !== 'completed' && !wormholeStatus) && (!isImage || !blob) && (
        <button onClick={onAccept} className="btn btn-sm btn-primary gap-2 mt-1 shadow-lg shadow-primary/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {metadata.method === 'wormhole' ? 'Reliable Download' : isCloud ? '☁️ Download from Cloud' : isImage ? 'Accept Image' : 'Accept File'}
        </button>
      )}

      {(!isMe || isCloud) && (metadata.method === 'wormhole' && wormholeStatus && ['connecting', 'found', 'checking-relay', 'encrypting', 'uploading'].includes(wormholeStatus)) && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-center gap-2 px-3 py-2 bg-black/10 rounded-xl border border-white/5 animate-pulse">
              <div className="loading loading-spinner loading-xs opacity-50"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                {`Wormhole: ${wormholeStatus}`}
              </span>
          </div>
        </div>
      )}

      {isMe && metadata.method === 'wormhole' && wormholeStatus && ['encrypting', 'uploading'].includes(wormholeStatus) && (
        <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-black/10 rounded-xl border border-white/5">
            <div className="loading loading-spinner loading-xs opacity-50"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 animate-pulse">
              {wormholeStatus === 'encrypting' ? 'Encrypting...' : 'Uploading to IPFS...'}
            </span>
        </div>
      )}

      {(status === 'completed' || (metadata.method === 'wormhole' && wormholeStatus === 'downloaded')) && blobUrl && (
        <a
          href={blobUrl}
          download={metadata.name}
          className="btn btn-sm btn-success gap-2 mt-1 no-animation"
        >
          {isCloud ? '💾 Saved in Cloud' : 'Download / Save'}
        </a>
      )}

      {status === 'failed' && (
        <div className="text-error text-xs mt-1 font-bold italic">Transfer Failed</div>
      )}
    </div>
  );
};
