import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QrScannerModalProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ onScan, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const startScanner = async () => {
      try {
        setError(null);
        setIsInitializing(true);
        
        // Ensure cleanup of previous instance
        if (scannerRef.current) {
          try { await scannerRef.current.stop(); } catch(e) {}
        }

        const html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 20, // Increased for smoother detection
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdge * 0.8); // 80% of the smallest edge
            return { width: qrboxSize, height: qrboxSize };
          },
          aspectRatio: 1.0
        };

        // Prefer back camera on mobile
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            console.log("QR Decoded successfully:", decodedText);
            html5QrCode.stop().then(() => {
              onScan(decodedText);
            }).catch(() => {
              onScan(decodedText);
            });
          },
          () => { /* ignore failures */ }
        );
      } catch (err: any) {
        console.error("Scanner Start Error:", err);
        if (err?.includes?.("Permission") || err?.name === "NotAllowedError") {
          setError("Camera permission denied. Please allow camera access in your browser settings.");
        } else {
          setError(`Could not start camera: ${err.message || err}`);
        }
      } finally {
        setIsInitializing(false);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(e => console.error("Failed to stop scanner on unmount", e));
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-base-100 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl border border-base-content/10 my-auto">
        <header className="p-6 border-b border-base-content/5 flex justify-between items-center bg-base-200/50">
          <h3 className="text-xl font-black text-primary uppercase tracking-tight">Scan QR Code</h3>
          <button 
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-sm opacity-40 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </header>
        
        <div className="p-6">
          <div className="relative aspect-square w-full rounded-3xl overflow-hidden bg-black border border-base-content/10 shadow-inner">
            <div id="qr-reader" className="w-full h-full"></div>
            
            {(isInitializing || error) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-300/80 backdrop-blur-sm p-8 text-center">
                {isInitializing ? (
                  <>
                    <span className="loading loading-spinner loading-lg text-primary mb-4"></span>
                    <p className="text-xs font-black uppercase tracking-widest opacity-40">Initializing Camera...</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-error">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-error mb-6 leading-relaxed">{error}</p>
                    <button 
                      onClick={() => window.location.reload()}
                      className="btn btn-primary btn-sm rounded-xl px-8"
                    >
                      Retry
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {!error && !isInitializing && (
            <div className="mt-6 flex flex-col gap-4">
              <p className="text-center text-[10px] font-black opacity-40 uppercase tracking-[0.2em] leading-relaxed">
                Inquadra il codice QR o carica un'immagine
              </p>
              
              <div className="flex justify-center">
                <label className="btn btn-ghost btn-sm rounded-xl px-6 border border-base-content/10 bg-base-content/5 hover:bg-base-content/10 transition-all flex gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 opacity-60">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span>Scegli Foto</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !scannerRef.current) return;
                      try {
                        const result = await scannerRef.current.scanFileV2(file, false);
                        onScan(result.decodedText);
                      } catch (err: any) {
                        setError("Could not decode QR from image. Try a clearer photo.");
                      }
                    }} 
                  />
                </label>
              </div>
            </div>
          )}
        </div>
        
        <footer className="p-6 bg-base-200/50 text-center">
            <button 
                onClick={onClose}
                className="btn btn-ghost rounded-2xl font-black text-xs uppercase tracking-widest px-10 border border-base-content/10 hover:bg-base-content/5 transition-all"
            >
                Chiudi
            </button>
        </footer>
      </div>
    </div>
  );
};
