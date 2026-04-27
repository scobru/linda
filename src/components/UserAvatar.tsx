import React, { useState, useEffect } from "react";
import { DataBase } from "../zen/db";
import { getDiceBearAvatar } from "../utils/avatar";

interface UserAvatarProps {
  pub: string;
  db: DataBase;
  className?: string;
  isGroup?: boolean;
}

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
  const [avatar, setAvatar] = useState<string | null>(() => {
    if (!pub) return null;
    const cleanPub = DataBase.cleanPub(pub);
    return localStorage.getItem(`linda_avatar_${cleanPub}`);
  });

  useEffect(() => {
    if (!pub || !db) return;

    const cleanPub = DataBase.cleanPub(pub);
    
    // Define all possible paths for the avatar
    const paths = isGroup 
      ? [`linda_rooms/${cleanPub}/meta/avatar`] 
      : [
          `~${cleanPub}/profile/avatar`, 
          `linda_public_profiles/${cleanPub}/avatar`
        ];
    
    // Subscribe to all paths
    paths.forEach(path => {
      db.On(path, (data: any) => {
        if (typeof data === "string") {
          setAvatar(data);
          // If it's the current user, keep localStorage in sync
          if (!isGroup && cleanPub === DataBase.cleanPub(db.getUserPub() || "")) {
            localStorage.setItem(`linda_avatar_${cleanPub}`, data);
          }
        }
      });
    });

    // Note: We don't call db.Off(path) here because Gun's .off() 
    // is destructive and would remove listeners for all components 
    // watching this avatar (e.g. sidebar AND chat view).
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
