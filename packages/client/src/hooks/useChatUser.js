import { useState, useEffect } from "react";
import { userProfileService } from "../protocol/services";

export const useChatUser = (selected, chatData) => {
  const [chatUserInfo, setChatUserInfo] = useState({
    displayName: selected?.name || "Loading...",
    username: "",
    nickname: "",
  });
  const [chatUserAvatar, setChatUserAvatar] = useState("");

  useEffect(() => {
    if (!selected?.pub || selected?.type !== "friend") return;

    const loadUserInfo = async () => {
      try {
        const userInfo = await userProfileService.loadUserInfo(selected.pub);
        if (userInfo) {
          setChatUserInfo({
            displayName: userInfo.displayName || selected.alias,
            username: userInfo.username || "",
            nickname: userInfo.nickname || "",
          });
          setChatUserAvatar(userInfo.avatar || "");
        }
      } catch (error) {
        console.error("Errore caricamento info utente:", error);
      }
    };

    loadUserInfo();

    // Sottoscrizione agli aggiornamenti del profilo
    const unsubscribe = userProfileService.subscribeToUserInfo(
      selected.pub,
      (userInfo) => {
        setChatUserInfo({
          displayName: userInfo.displayName || selected.alias,
          username: userInfo.username || "",
          nickname: userInfo.nickname || "",
        });
        if (userInfo.avatar) setChatUserAvatar(userInfo.avatar);
      }
    );

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [selected?.pub, selected?.type, selected?.name, selected?.alias]);

  return { chatUserInfo, chatUserAvatar };
};
