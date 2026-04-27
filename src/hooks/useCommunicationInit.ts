import { useState, useEffect } from 'react';
import { useShogun } from 'shogun-button-react';
import { DataBase } from 'shogun-core';
import { CommunicationService } from '../CommunicationService';
import { GroupService } from '../GroupService';

export const useCommunicationInit = (db: DataBase, showNotification: (msg: string, type?: 'info' | 'error') => void) => {
  const { isLoggedIn, username } = useShogun();
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
          
          // Wait for sync: Retry fetch multiple times over 10s before giving up
          console.log(`[useCommunicationInit] Fetching uniqueUsername for ${username}...`);
          for (let i = 0; i < 15; i++) {
            try {
              uniqueName = (await db.userGet('profile/uniqueUsername')) as string;
              if (uniqueName && typeof uniqueName === 'string') break;
            } catch (e: any) {
              if (e && e.err !== 'notfound') console.warn("[useCommunicationInit] Fetch error:", e);
            }
            await new Promise(r => setTimeout(r, 750));
          }

          if (!uniqueName) {
            console.log(`[useCommunicationInit] Handle not found for ${username}, generating random fallback...`);
            // Generate a default one: @name + 4 random digits
            const digits = Math.floor(1000 + Math.random() * 9000);
            uniqueName = `@${username}${digits}`;
            
            // Gun usernames/aliases must be 64 chars or less
            if (uniqueName.length > 64) {
              uniqueName = uniqueName.slice(0, 64);
            }

            // Try to save it
            const user = db.gun.user();
            if (user.is) {
              user.get('profile').get('uniqueUsername').put(uniqueName);
            }
            const pub = db.getUserPub();
            if (pub) {
              db.gun.get('signal_unique_usernames').get(uniqueName).put(pub);
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
