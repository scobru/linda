import { useState, useEffect, useRef } from "react";
import { DataBase } from "../zen/db";
import { CommunicationService } from "../CommunicationService";

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
        if (isGroup) {
          db.On(`signal_rooms/${contactId}/meta`, (data: any) => {
            if (data && typeof data === "object") {
              setContactProfiles((prev) => ({
                ...prev,
                [contactId]: { ...prev[contactId], nickname: data.name, avatar: data.avatar },
              }));
            }
          });
        } else {
          let cPub = contactId;
          if (contactId.length < 43 || contactId.startsWith("@")) {
            cPub = await communicationService.getPubKeyFromUsername(contactId);
          }
          if (cPub) {
            db.On(`~${cPub}/profile/avatar`, (data: any) =>
              typeof data === "string" && setContactProfiles((prev) => ({
                ...prev,
                [contactId]: { ...prev[contactId], avatar: data },
              }))
            );
            db.On(`~${cPub}/profile/nickname`, (data: any) =>
              typeof data === "string" && setContactProfiles((prev) => ({
                ...prev,
                [contactId]: { ...prev[contactId], nickname: data },
              }))
            );
            db.On(`~${cPub}/alias`, (data: any) =>
              typeof data === "string" && setContactProfiles((prev) => {
                const existing = prev[contactId] || {};
                if (existing.nickname) return prev;
                return { ...prev, [contactId]: { ...existing, nickname: data } };
              })
            );
          }
        }
      } catch (e) {}
    });
  }, [contacts, communicationService, db]);

  return { userNick, contactProfiles };
};
