import { useState, useEffect } from 'react';
import { useShogun } from 'shogun-button-react';
import { DataBase } from 'shogun-core';
import { SignalService } from '../SignalService';
import { GroupService } from '../GroupService';

export const useSignalInit = (db: DataBase, showNotification: (msg: string, type?: 'info' | 'error') => void) => {
  const { isLoggedIn, username } = useShogun();
  const [signalService, setSignalService] = useState<SignalService | null>(null);
  const [groupService, setGroupService] = useState<GroupService | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userUniqueUsername, setUserUniqueUsername] = useState<string>('');

  useEffect(() => {
    const initSignalSession = async () => {
      if (isLoggedIn && username) {
        setIsLoading(true);
        try {
          // 1. Fetch or generate uniqueUsername
          let uniqueName: string | undefined;
          try {
            uniqueName = (await db.userGet('profile/uniqueUsername')) as string;
          } catch (e: any) {
            if (e && e.err !== 'notfound') {
              throw e;
            }
          }

          if (!uniqueName) {
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

          const service = new SignalService(db);
          await service.initSession(username, uniqueName);
          
          // Re-persist alias to ensure it's in the public registry for others to see
          try {
             const pub = db.getUserPub();
             if (pub) {
               await (service as any).persistAlias(username, uniqueName);
             }
          } catch (e) {}

          setSignalService(service);
          
          const gService = new GroupService(db);
          setGroupService(gService);
          showNotification(`Welcome, ${username}! Signal session ready.`);
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
