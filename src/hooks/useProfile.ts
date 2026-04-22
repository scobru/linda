import { useState, useEffect, useRef } from "react";
import { DataBase } from "../zen/db";
import { CommunicationService } from "../services/CommunicationService";

export const useProfile = (
  db: DataBase,
  isLoggedIn: boolean,
  contacts: string[],
  communicationService: CommunicationService | null
) => {
  const [userNick, setUserNick] = useState<string>(localStorage.getItem("linda_user_nick") || "");
  const [contactProfiles, setContactProfiles] = useState<
    Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>
  >({});
  const subscribedProfilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoggedIn) {
      localStorage.removeItem("linda_user_nick");
      localStorage.removeItem("linda_user_unique_username");
      return;
    }
    const pub = db.getUserPub();
    if (pub) {
      db.On(`~${pub}/profile/nickname`, (data: any) => {
        if (typeof data === "string") {
          setUserNick(data);
          localStorage.setItem("linda_user_nick", data);
        }
      });
      return () => db.Off(`~${pub}/profile/nickname`);
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
          
          if (isGroup) {
            db.On(`signal_rooms/${cleanId}/meta`, (data: any) => {
              if (data && typeof data === "object") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [cleanId]: { ...prev[cleanId], nickname: data.name, avatar: data.avatar },
                }));
              }
            });
          } else {
            let cPub = cleanId;
            if (cleanId.length < 43 || cleanId.startsWith("@")) {
              cPub = DataBase.cleanPub(await communicationService.getPubKeyFromUsername(cleanId));
            }

            if (cPub) {
              const updateProfile = (id: string, updates: Partial<{ nickname: string; avatar: string; uniqueUsername: string }>) => {
                setContactProfiles((prev) => {
                  const existing = prev[id] || {};
                  // Priority check: avoid overwriting dynamic nickname with a less specific one if already present
                  // but for simplicity, we let the latest update win as db.On is reactive.
                  return { ...prev, [id]: { ...existing, ...updates } };
                });
              };

              db.On(`~${cPub}/profile/avatar`, (data: any) =>
                typeof data === "string" && updateProfile(cleanId, { avatar: data })
              );

              // Primary path for nicknames
              db.On(`~${cPub}/profile/nickname`, (data: any) =>
                typeof data === "string" && updateProfile(cleanId, { nickname: data })
              );

              // Secondary: v7 bundle username
              db.On(`~${cPub}/signal_bundle_v7/username`, (data: any) =>
                typeof data === "string" && updateProfile(cleanId, { nickname: data })
              );

              // Tertiary: signal_aliases global index
              db.On(`signal_aliases/${cPub}/alias`, (data: any) =>
                typeof data === "string" && updateProfile(cleanId, { nickname: data })
              );

              // Quaternary: Fallback to native alias
              db.On(`~${cPub}/alias`, (data: any) =>
                typeof data === "string" && updateProfile(cleanId, { nickname: data })
              );

              // Also resolve unique handles (@handle)
              db.On(`~${cPub}/profile/uniqueUsername`, (data: any) =>
                typeof data === "string" && updateProfile(cleanId, { uniqueUsername: data })
              );
            }
          }
        } catch (e) {}
    });
  }, [contacts, communicationService, db]);

  return { userNick, contactProfiles };
};
