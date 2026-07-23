import { useState, useEffect } from 'react';
import { DataBase } from 'linda-core';
import { CommunicationService } from 'linda-core';
import { GroupService } from 'linda-core';
import { generateRandomHandle } from 'linda-core';

export const useCommunicationInit = (
  db: DataBase, 
  isLoggedIn: boolean, 
  username: string | null, 
  showNotification: (msg: string, type?: 'info' | 'error') => void
) => {
  const [communicationService, setCommunicationService] = useState<CommunicationService | null>(null);
  const [groupService, setGroupService] = useState<GroupService | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userUniqueUsername, setUserUniqueUsername] = useState<string>(localStorage.getItem("linda_user_unique_username") || "");

  useEffect(() => {
    const initCommunicationSession = async () => {
      if (isLoggedIn && username) {
        setIsLoading(true);
        try {
          // 1. Fetch or generate uniqueUsername
          let uniqueName: string | undefined;
          
          // Wait for sync: Try fetch multiple times before giving up.
          // We reduce attempts and timeout to prevent long UI blocking.
          if (!userUniqueUsername) {
            console.log(`[useCommunicationInit] Syncing unique handle for ${username}...`);
            for (let i = 0; i < 5; i++) {
              try {
                uniqueName = (await db.userGet('profile/uniqueUsername', 5000)) as string;
                if (uniqueName && typeof uniqueName === 'string' && uniqueName.startsWith('@')) break;
              } catch (e: any) {
                if (e && e.err !== 'notfound') console.warn("[useCommunicationInit] Sync attempt failed:", e);
              }
              await new Promise(r => setTimeout(r, 500));
            }
          } else {
            uniqueName = userUniqueUsername;
          }

          if (!uniqueName) {
            console.log(`[useCommunicationInit] Handle not found for ${username}, generating deterministic fallback...`);
            const pub = db.getUserPub();
            uniqueName = generateRandomHandle(pub || username);
            
            // Try to save it
            await db.userPut('profile/uniqueUsername', uniqueName);
            
            if (pub) {
              await db.Put(`linda_unique_usernames/${uniqueName}`, pub);
            }
          }
          if (uniqueName) {
            setUserUniqueUsername(uniqueName);
            localStorage.setItem("linda_user_unique_username", uniqueName);
          }

          const service = new CommunicationService(db);
          await service.initSession(username, uniqueName);
          setCommunicationService(service);
          
          // Proactively ensure local cache is synchronized for useProfile
          // But ONLY if it's a real username, not a pubkey fallback
          const isPub = username.length >= 30 && !username.includes(" ") && !username.startsWith("@");
          if (!isPub) {
            localStorage.setItem("linda_alias", username);
          }
          
          const gService = new GroupService(db);
          setGroupService(gService);
          
          // Removed PQ Identity publish

          showNotification(`Welcome, ${username}! Secure session ready.`);
        } catch (e) {
          console.error('[useCommunicationInit] Communication session initialization failed:', e);
          showNotification('Failed to initialize communication keys', 'error');
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
        setCommunicationService(null);
        setGroupService(null);
      }
    };
    initCommunicationSession();

    if (isLoggedIn) {
      const pub = db.getUserPub();
      if (pub) {
        db.On(`~${pub}/profile/uniqueUsername`, (data: any) => {
          if (typeof data === "string" && data.startsWith("@")) {
            setUserUniqueUsername(data);
            localStorage.setItem("linda_user_unique_username", data);
          }
        });
        return () => {
          db.Off(`~${pub}/profile/uniqueUsername`);
        };
      }
    }
  }, [isLoggedIn, username, db, showNotification]);

  return { communicationService, groupService, isLoading, userUniqueUsername };
};
