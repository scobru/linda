import { useState, useEffect } from 'react';
import { useShogun } from 'shogun-button-react';
import { DataBase } from 'shogun-core';
import { SignalService } from '../SignalService';
import { GroupService } from '../GroupService';
import { generateSecureRandomInt } from '../utils/crypto';

export const useSignalInit = (db: DataBase, showNotification: (msg: string, type?: 'info' | 'error') => void) => {
  const { isLoggedIn, username } = useShogun();
  const [signalService, setSignalService] = useState<SignalService | null>(null);
  const [groupService, setGroupService] = useState<GroupService | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userUniqueUsername, setUserUniqueUsername] = useState<string>(localStorage.getItem("linda_user_unique_username") || "");

  useEffect(() => {
    const initSignalSession = async () => {
      if (isLoggedIn && username) {
        setIsLoading(true);
        try {
          // 1. Fetch or generate uniqueUsername
          let uniqueName: string | undefined;
          
          // Wait for sync: Retry fetch multiple times over 10s before giving up
          console.log(`[useSignalInit] Fetching uniqueUsername for ${username}...`);
          for (let i = 0; i < 15; i++) {
            try {
              uniqueName = (await db.userGet('profile/uniqueUsername')) as string;
              if (uniqueName && typeof uniqueName === 'string') break;
            } catch (e: any) {
              if (e && e.err !== 'notfound') console.warn("[useSignalInit] Fetch error:", e);
            }
            await new Promise(r => setTimeout(r, 750));
          }

          if (!uniqueName) {
            console.log(`[useSignalInit] Handle not found for ${username}, generating random fallback...`);
            // Generate a default one: @name + 4 random digits
            const digits = generateSecureRandomInt(9000) + 1000;
            uniqueName = `@${username}${digits}`;
            
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

          const service = new SignalService(db);
          await service.initSession(username, uniqueName);
          setSignalService(service);
          
          const gService = new GroupService(db);
          setGroupService(gService);
          showNotification(`Welcome, ${username}! Secure session ready.`);
        } catch (e) {
          console.error('[useSignalInit] Signal session initialization failed:', e);
          showNotification('Failed to initialize Signal keys', 'error');
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
        setSignalService(null);
        setGroupService(null);
      }
    };
    initSignalSession();
  }, [isLoggedIn, username, db, showNotification]);

  return { signalService, groupService, isLoading, userUniqueUsername };
};
