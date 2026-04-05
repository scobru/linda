import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QrScannerModalProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ onScan, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [currentCameraIdx, setCurrentCameraIdx] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // 1. Fetch available cameras on mount
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices.map(d => ({ id: d.id, label: d.label })));
          // Try to find a back camera by default
          const backIdx = devices.findIndex(d => d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("environment"));
          if (backIdx !== -1) setCurrentCameraIdx(backIdx);
        }
      })
      .catch((err) => console.error("Error getting cameras", err));
  }, []);

  const startScanner = useCallback(async (deviceId: string | { facingMode: string }) => {
    try {
      setError(null);
      setIsInitializing(true);
      
      if (scannerRef.current) {
        try { 
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop(); 
          }
        } catch(e) {
          console.error("Failed to stop previous scanner", e);
        }
      }

      const html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdge * 0.85);
          return { width: qrboxSize, height: qrboxSize };
        },
        aspectRatio: 1.0,
        videoConstraints: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          facingMode: typeof deviceId === "string" ? undefined : deviceId.facingMode,
          focusMode: "continuous"
        }
      };

      await html5QrCode.start(
        deviceId,
        config as any,
        (decodedText) => {
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
        setError("Camera permission denied.");
      } else {
        setError(`Could not start camera: ${err.message || err}`);
      }
    } finally {
      setIsInitializing(false);
    }
  }, [onScan]);

  useEffect(() => {
    if (cameras.length > 0) {
      startScanner(cameras[currentCameraIdx].id);
    } else {
      startScanner({ facingMode: "environment" });
    }

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(e => console.error("Cleanup error", e));
      }
    };
  }, [cameras, currentCameraIdx, startScanner]);

  const toggleCamera = () => {
    if (cameras.length > 1) {
      setCurrentCameraIdx((prev) => (prev + 1) % cameras.length);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/95 backdrop-blur-xl animate-fadeIn overflow-y-auto">
      <div className="bg-base-100 w-full max-w-md rounded-[3rem] overflow-hidden shadow-2xl border border-base-content/10 my-auto">
        <header className="p-8 border-b border-base-content/5 flex justify-between items-center bg-base-200/30">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-primary uppercase tracking-tight">QR Scanner</h3>
            {cameras.length > 0 && (
              <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest truncate max-w-[200px]">
                {cameras[currentCameraIdx].label || `Camera ${currentCameraIdx + 1}`}
              </p>
            )}
          </div>
          <button 
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-sm opacity-40 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </header>
        
        <div className="p-8">
          <div className="relative aspect-square w-full rounded-[2.5rem] overflow-hidden bg-black border-4 border-base-content/5 shadow-2xl">
            <div id="qr-reader" className="w-full h-full scale-110"></div>
            
            {(isInitializing || error) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-base-300/90 backdrop-blur-md p-8 text-center z-10">
                {isInitializing ? (
                  <>
                    <span className="loading loading-spinner loading-lg text-primary mb-4"></span>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Configuring Lens...</p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-10 h-10 text-error">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-error mb-8 leading-relaxed px-4">{error}</p>
                    <button 
                      onClick={() => window.location.reload()}
                      className="btn btn-error btn-outline rounded-2xl px-10 font-black uppercase text-xs tracking-widest"
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Viewfinder Decorator */}
            {!isInitializing && !error && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                 <div className="w-[85%] h-[85%] border-2 border-primary/40 rounded-3xl relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl"></div>
                 </div>
              </div>
            )}
          </div>

          <div className="mt-8 space-y-4">
            {!error && !isInitializing && cameras.length > 1 && (
               <button 
                  onClick={toggleCamera}
                  className="btn btn-primary w-full h-14 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-primary/20 transition-transform active:scale-95"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  <span className="font-black uppercase tracking-widest text-xs">Switch Camera</span>
               </button>
            )}

            <div className="flex items-center gap-3">
                <label className="btn btn-ghost flex-1 h-14 rounded-2xl bg-base-content/5 hover:bg-base-content/10 border-none transition-all flex items-center justify-center gap-3 group">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 opacity-40 group-hover:opacity-100 transition-opacity">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="font-bold uppercase tracking-widest text-[10px] opacity-60">Upload Photo</span>
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
                        setError("Could not decode image. Try a clearer photo.");
                      }
                    }} 
                  />
                </label>
            </div>
          </div>
        </div>
        
        <footer className="p-8 bg-base-200/30 border-t border-base-content/5">
            <button 
                onClick={onClose}
                className="btn btn-ghost w-full rounded-2xl font-black text-xs uppercase tracking-[0.3em] opacity-40 hover:opacity-100 transition-all"
            >
                Cancel
            </button>
        </footer>
      </div>
    </div>
  );
};
