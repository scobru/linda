import { useState, useEffect } from 'react';
import { DataBase } from '../zen/db';
import { CommunicationService } from '../CommunicationService';
import { GroupService } from '../GroupService';

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
          
          // Wait for sync: Retry fetch multiple times over a few seconds before giving up
          console.log(`[useCommunicationInit] Fetching uniqueUsername for ${username}...`);
          for (let i = 0; i < 5; i++) {
            try {
              uniqueName = (await db.userGet('profile/uniqueUsername')) as string;
              if (uniqueName && typeof uniqueName === 'string') break;
            } catch (e: any) {
              if (e && e.err !== 'notfound') console.warn("[useCommunicationInit] Fetch error:", e);
            }
            await new Promise(r => setTimeout(r, 500));
          }

          if (!uniqueName) {
            console.log(`[useCommunicationInit] Handle not found for ${username}, generating random fallback...`);
            // Generate a default one: @name + 4 random digits
            const digits = Math.floor(1000 + Math.random() * 9000);
            uniqueName = `@${username}${digits}`;
            
            // Try to save it
            await db.userPut('profile/uniqueUsername', uniqueName);
            
            const pub = db.getUserPub();
            if (pub) {
              await db.Put(`signal_unique_usernames/${uniqueName}`, pub);
            }
          }
          setUserUniqueUsername(uniqueName);
          localStorage.setItem("linda_user_unique_username", uniqueName);

          const service = new CommunicationService(db);
          await service.initSession(username, uniqueName);
          setCommunicationService(service);
          
          const gService = new GroupService(db);
          setGroupService(gService);
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
  }, [isLoggedIn, username, db, showNotification]);

  return { communicationService, groupService, isLoading, userUniqueUsername };
};
