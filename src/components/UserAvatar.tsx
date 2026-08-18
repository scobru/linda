import React, { useState, useEffect } from "react";
import { DataBase } from 'linda-core';
import { getDiceBearAvatar } from "../utils/avatar";
import { groupPath } from '../utils/groupPath.js';

interface UserAvatarProps {
  pub: string;
  db: DataBase;
  className?: string;
  isGroup?: boolean;
}

const getStoredAvatar = (rawPub: string): string | null => {
  if (!rawPub) return null;
  const cleanPub = DataBase.cleanPub(rawPub);
  const direct = localStorage.getItem(`linda_avatar_${cleanPub}`) || localStorage.getItem(`linda_avatar_${rawPub}`);
  if (direct) return direct;
  try {
    const cached = localStorage.getItem("linda_contact_profiles_v2");
    if (cached) {
      const profiles = JSON.parse(cached);
      if (profiles[cleanPub]?.avatar) return profiles[cleanPub].avatar;
      if (profiles[rawPub]?.avatar) return profiles[rawPub].avatar;
    }
  } catch (e) {}
  return null;
};

/**
 * A robust avatar component that handles GunDB subscriptions 
 * to show custom avatars with an automatic DiceBear fallback.
 * Memoized to prevent re-renders in long lists (ChatView, Sidebar).
 */
export const UserAvatar: React.FC<UserAvatarProps> = React.memo(({ 
  pub, 
  db, 
  className = "w-12 h-12", 
  isGroup = false 
}) => {
  const [avatar, setAvatar] = useState<string | null>(() => getStoredAvatar(pub));

  // Reset when the subject changes
  useEffect(() => {
    setAvatar(getStoredAvatar(pub));
  }, [pub]);

  useEffect(() => {
    if (!pub || !db) return;

    const cleanPub = DataBase.cleanPub(pub);
    
    // Define all possible paths for the avatar
    const paths = isGroup 
      ? [
          `${groupPath(cleanPub)}/meta/avatar`,
          `${groupPath(cleanPub)}/meta`,
          ...(pub !== cleanPub ? [`${groupPath(pub)}/meta/avatar`, `${groupPath(pub)}/meta`] : [])
        ] 
      : [
          `~${cleanPub}/profile/avatar`, 
          `linda_public_profiles/${cleanPub}/avatar`
        ];
    
    const handleAvatarData = (data: any) => {
      let avatarUrl = "";
      if (typeof data === "string" && data.trim()) {
        avatarUrl = data.trim();
      } else if (data && typeof data === "object" && typeof data.avatar === "string" && data.avatar.trim()) {
        avatarUrl = data.avatar.trim();
      }

      if (avatarUrl && !avatarUrl.startsWith("{")) {
        setAvatar(avatarUrl);
        try {
          localStorage.setItem(`linda_avatar_${cleanPub}`, avatarUrl);
          if (pub !== cleanPub) {
            localStorage.setItem(`linda_avatar_${pub}`, avatarUrl);
          }
        } catch (e) {}
      }
    };

    // Proactive initial fetch
    paths.forEach(path => {
      db.Get(path, 3000, true).then(handleAvatarData).catch(() => {});
    });

    // Reactive listener
    paths.forEach(path => {
      db.On(path, handleAvatarData);
    });

    // Real-time custom event listener for immediate same-tab UI updates
    const onAvatarUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ pub: string; avatar: string }>;
      if (customEvent.detail && (customEvent.detail.pub === pub || customEvent.detail.pub === cleanPub)) {
        if (customEvent.detail.avatar) {
          setAvatar(customEvent.detail.avatar);
        }
      }
    };
    window.addEventListener("linda_avatar_updated", onAvatarUpdated);

    return () => {
      window.removeEventListener("linda_avatar_updated", onAvatarUpdated);
    };
  }, [pub, db, isGroup]);

  return (
    <div className={`avatar ${className}`}>
      <div className="rounded-full overflow-hidden w-full h-full bg-base-300 ring-1 ring-base-content/5 shadow-inner">
        {avatar ? (
          <img 
            src={avatar} 
            alt="User Avatar" 
            className="w-full h-full object-cover transition-opacity duration-300"
            onLoad={(e) => (e.currentTarget.style.opacity = "1")}
            style={{ opacity: 0 }}
          />
        ) : (
          <img 
            src={getDiceBearAvatar(pub, isGroup)} 
            alt="Fallback Avatar" 
            className="w-full h-full object-cover bg-primary/5" 
          />
        )}
      </div>
    </div>
  );
});
