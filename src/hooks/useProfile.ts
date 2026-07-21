import { useState, useEffect, useRef } from "react";
import { DataBase } from 'linda-core';
import { CommunicationService } from 'linda-core';

export const useProfile = (
  db: DataBase,
  isLoggedIn: boolean,
  contacts: string[],
  communicationService: CommunicationService | null
) => {
  const [userNick, setUserNick] = useState<string>(localStorage.getItem("linda_alias") || "");
  
  // Initialize contact profiles from cache
  const [contactProfiles, setContactProfiles] = useState<
    Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>
  >(() => {
    try {
      const cached = localStorage.getItem("linda_contact_profiles_v2");
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      return {};
    }
  });

  const subscribedProfilesRef = useRef<Set<string>>(new Set());

  // Persist contact profiles to cache whenever they change
  useEffect(() => {
    if (Object.keys(contactProfiles).length > 0) {
      localStorage.setItem("linda_contact_profiles_v2", JSON.stringify(contactProfiles));
    }
  }, [contactProfiles]);

  useEffect(() => {
    if (!isLoggedIn) {
      localStorage.removeItem("linda_alias");
      localStorage.removeItem("linda_user_unique_username");
      return;
    }
    const pub = db.getUserPub();
    if (pub) {
      const tryPaths = [
        `~${pub}/profile/nickname`,
        `~${pub}/profile/name`,
        `~${pub}/alias`,
        `linda_pub_to_nickname/${pub}`,
        `signal_aliases/${pub}/alias`,
      ];

      tryPaths.forEach(path => {
        db.Get(path, 5000).then(data => {
          if (typeof data === "string" && data) {
            setUserNick(data);
            localStorage.setItem("linda_alias", data);
          } else if (data && typeof data === "object") {
            const val = data.nickname || data.alias || data.name;
            if (typeof val === "string" && val) {
                setUserNick(val);
                localStorage.setItem("linda_alias", val);
            }
          }
        });

        db.On(path, (data: any) => {
          if (typeof data === "string" && data) {
            setUserNick(data);
            localStorage.setItem("linda_alias", data);
          } else if (data && typeof data === "object") {
            const val = data.nickname || data.alias || data.name;
            if (typeof val === "string" && val) {
                setUserNick(val);
                localStorage.setItem("linda_alias", val);
            }
          }
        });
      });
    }
  }, [isLoggedIn, db]);

  useEffect(() => {
    if (!communicationService || contacts.length === 0) return;
    
    contacts.forEach(async (contactId) => {
      if (subscribedProfilesRef.current.has(contactId)) return;
      subscribedProfilesRef.current.add(contactId);

      try {
          const isGroup = contactId.length === 36 && contactId.includes("-");
          const cleanId = isGroup ? contactId : DataBase.cleanPub(contactId);
          
          const updateProfile = (id: string, updates: Partial<{ nickname: string; avatar: string; uniqueUsername: string }>) => {
            setContactProfiles((prev) => {
              const existing = prev[id] || {};
              const cleanUpdates: typeof updates = {};
              
              if (updates.nickname && typeof updates.nickname === "string" && updates.nickname.trim()) {
                cleanUpdates.nickname = updates.nickname.trim();
              }
              if (updates.avatar && typeof updates.avatar === "string" && updates.avatar.trim()) {
                cleanUpdates.avatar = updates.avatar.trim();
              }
              if (updates.uniqueUsername && typeof updates.uniqueUsername === "string" && updates.uniqueUsername.trim()) {
                cleanUpdates.uniqueUsername = updates.uniqueUsername.trim();
              }

              if (Object.keys(cleanUpdates).length === 0) return prev;

              const next = { ...existing, ...cleanUpdates };
              if (JSON.stringify(existing) === JSON.stringify(next)) return prev;
              return { ...prev, [id]: next };
            });
          };

          if (isGroup) {
            db.On(`linda_rooms/${cleanId}/meta`, (data: any) => {
              if (data && typeof data === "object") {
                const name = typeof data.name === "string" ? data.name.trim() : "";
                const avatar = typeof data.avatar === "string" ? data.avatar.trim() : "";
                if (name || avatar) {
                  updateProfile(cleanId, { ...(name ? { nickname: name } : {}), ...(avatar ? { avatar } : {}) });
                }
              }
            });
          } else {
            let cPub = cleanId;
            if (cleanId.length < 43 || cleanId.startsWith("@")) {
              const resolved = await communicationService.getPubKeyFromUsername(cleanId);
              if (resolved) cPub = DataBase.cleanPub(resolved);
            }

          if (cPub) {
              // 1. Proactive Initial Fetch (speed up UI load)
              const tryPaths = [
                `linda_pub_to_nickname/${cPub}`,
                `linda_pub_to_handle/${cPub}`,
                `~${cPub}/profile/nickname`,
                `~${cPub}/profile/name`,
                `~${cPub}/profile/username`,
                `~${cPub}/profile/uniqueUsername`,
                `linda_aliases/${cPub}/alias`,
                `linda_aliases/${cPub}`, // Try object root
                `~${cPub}/alias`,
                `~${cPub}/profile/avatar`,
                // Legacy Fallbacks
                `~${cPub}/signal_bundle_v7/username`,
                `signal_aliases/${cPub}/alias`,
                `~${cPub}/profile/display_name`,
                `~${cPub}/nickname`
              ];

              // Rapid fire safeGet for nickname fallback
              for (const path of tryPaths) {
                db.Get(path, 4000, true).then(data => {
                  if (!data) return;
                  
                  let resolvedString = "";
                  if (typeof data === "string") resolvedString = data.trim();
                  else if (typeof data === "object") {
                    const raw = data.nickname || data.alias || data.name || data.username || data.uniqueUsername || "";
                    if (typeof raw === "string") resolvedString = raw.trim();
                  }

                  if (resolvedString && !resolvedString.startsWith("{")) {
                    if (path.includes("avatar")) updateProfile(cleanId, { avatar: resolvedString });
                    else if (path.includes("uniqueUsername")) updateProfile(cleanId, { uniqueUsername: resolvedString });
                    else updateProfile(cleanId, { nickname: resolvedString });
                  }
                });
              }

              // 2. Reactive Listeners for live updates
              const reactivePaths = [
                { path: `linda_pub_to_nickname/${cPub}`, field: 'nickname' },
                { path: `linda_pub_to_handle/${cPub}`, field: 'uniqueUsername' },
                { path: `~${cPub}/profile/avatar`, field: 'avatar' },
                { path: `~${cPub}/profile/nickname`, field: 'nickname' },
                { path: `~${cPub}/profile/name`, field: 'nickname' },
                { path: `~${cPub}/profile/uniqueUsername`, field: 'uniqueUsername' },
                { path: `~${cPub}/linda_bundle_v7/username`, field: 'nickname' },
                { path: `linda_aliases/${cPub}/alias`, field: 'nickname' },
                { path: `~${cPub}/alias`, field: 'nickname' },
                // Legacy reactive fallbacks
                { path: `~${cPub}/signal_bundle_v7/username`, field: 'nickname' },
                { path: `signal_aliases/${cPub}/alias`, field: 'nickname' },
                { path: `~${cPub}/nickname`, field: 'nickname' }
              ];

              reactivePaths.forEach(({ path, field }) => {
                db.On(path, (data: any) => {
                  let val = "";
                  if (typeof data === "string") {
                    val = data.trim();
                  } else if (data && typeof data === "object") {
                    const found = data[field] || data.nickname || data.alias || data.name || data.avatar || data.username;
                    if (typeof found === "string") val = found.trim();
                  }

                  if (val && !val.startsWith("{")) {
                    updateProfile(cleanId, { [field]: val } as any);
                  }
                });
              });
            }
          }
        } catch (e) {
          console.error("[useProfile] Error resolving contact:", contactId, e);
        }
    });
  }, [contacts, communicationService, db]);

  return { userNick, contactProfiles };
};
