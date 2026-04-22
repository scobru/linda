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
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({ 
  pub, 
  db, 
  className = "w-12 h-12", 
  isGroup = false 
}) => {
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!pub || !db) return;

    const cleanPub = DataBase.cleanPub(pub);
    const path = isGroup 
      ? `signal_rooms/${cleanPub}/meta/avatar` 
      : `~${cleanPub}/profile/avatar`;
    
    // Subscribe to avatar changes
    
    db.On(path, (data: any) => {
      if (typeof data === "string") {
        setAvatar(data);
      }
    });

    return () => {
      db.Off(path);
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
};
