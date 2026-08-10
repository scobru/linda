import { useMemo, useState, useRef } from "react";
import { WormholeService } from 'linda-core';
import { DataBase } from 'linda-core';
import { getRelayAuthToken } from "../utils/relayAuth";

export const useWormhole = (
  db: DataBase, 
  isLoggedIn: boolean,
  setTransferProgress?: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  setTransferBlobs?: React.Dispatch<React.SetStateAction<Record<string, Blob>>>
) => {
  const [wormholeStatuses, setWormholeStatuses] = useState<Record<string, string>>({});
  const wormholeServiceRef = useRef<WormholeService | null>(null);

  const wormholeServiceInst = useMemo(() => {
    if (!isLoggedIn || !db.zen) return null;
    const service = new WormholeService(db.zen);
    
    service.onStatusChange = ({ code, status, fileData }: any) => {
      setWormholeStatuses((prev) => ({ ...prev, [code]: status }));
      
      // If downloaded, save the blob to the shared transfer blobs state
      if (status === 'downloaded' && fileData?.blob && setTransferBlobs) {
        setTransferBlobs((prev) => ({ ...prev, [code]: fileData.blob }));
      }
    };
    
    service.onProgress = ({ progress, code }: any) => {
      if (setTransferProgress) {
        setTransferProgress((prev) => ({ ...prev, [code]: progress }));
      }
    };
    
    wormholeServiceRef.current = service;

    // Cleanup logic
    const relays = ["http://localhost:8765"];
    const authToken = getRelayAuthToken();
    // No token, no cleanup: presenting a known credential is worse than
    // leaving stale transfers on the relay.
    if (authToken) {
      (async () => {
        for (const relayUrl of relays) {
          try {
            await service.cleanupStaleTransfers(relayUrl, authToken, 3600000);
            break;
          } catch (e) {}
        }
      })();
    }

    return service;
  }, [isLoggedIn, db.zen]);

  return { wormholeServiceInst, wormholeStatuses };
};
