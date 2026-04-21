import { useMemo, useState, useRef } from "react";
import { WormholeService } from "../WormholeService";
import { DataBase } from "../zen/db";

export const useWormhole = (db: DataBase, isLoggedIn: boolean) => {
  const [wormholeStatuses, setWormholeStatuses] = useState<Record<string, string>>({});
  const wormholeServiceRef = useRef<WormholeService | null>(null);

  const wormholeServiceInst = useMemo(() => {
    if (!isLoggedIn || !db.zen) return null;
    const service = new WormholeService(db.zen);
    
    service.onStatusChange = ({ code, status, message: _msg, fileData }) => {
      setWormholeStatuses((prev) => ({ ...prev, [code]: status }));
      // Blobs are handled in FileTransfer or passed back
    };
    
    service.onProgress = ({ progress, code }: any) => {
      if (code) {
        // This progress can be merged with transferProgress if needed
      }
    };
    
    wormholeServiceRef.current = service;

    // Cleanup logic
    const relays = ["http://localhost:8765"];
    const authToken = import.meta.env.VITE_AUTH_TOKEN || "shogun2025";
    (async () => {
      for (const relayUrl of relays) {
        try {
          await service.cleanupStaleTransfers(relayUrl, authToken, 3600000);
          break;
        } catch (e) {}
      }
    })();

    return service;
  }, [isLoggedIn, db.zen]);

  return { wormholeServiceInst, wormholeStatuses };
};
