import { useState, useEffect } from "react";
import { gun, DAPP_NAME } from "#protocol";
import { getUserUsername, getUserAvatar } from "../utils/userUtils";

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
        const info = await getUserUsername(selected.pub);
        setChatUserInfo({
          displayName: info || selected.alias,
          username: info || "",
          nickname: info || "",
        });

        const avatar = await getUserAvatar(selected.pub);
        setChatUserAvatar(avatar);
      } catch (error) {
        console.error("Errore caricamento info utente:", error);
      }
    };

    loadUserInfo();

    // Sottoscrizioni al profilo utente
    const unsubUserList = gun
      .get(DAPP_NAME)
      .get("userList")
      .get("users")
      .get(selected.pub)
      .on((data) => {
        if (data) {
          setChatUserInfo((prev) => ({
            ...prev,
            displayName: data.nickname || data.username || selected.alias,
            username: data.username || prev.username,
            nickname: data.nickname || prev.nickname,
          }));
          if (data.avatar) setChatUserAvatar(data.avatar);
        }
      });

    const unsubUsers = gun
      .get(DAPP_NAME)
      .get("users")
      .get(selected.pub)
      .on((data) => {
        if (data) {
          setChatUserInfo((prev) => ({
            ...prev,
            displayName: data.nickname || data.username || selected.alias,
            username: data.username || prev.username,
            nickname: data.nickname || prev.nickname,
          }));
          if (data.avatar) setChatUserAvatar(data.avatar);
        }
      });

    return () => {
      if (typeof unsubUserList === "function") unsubUserList();
      if (typeof unsubUsers === "function") unsubUsers();
    };
  }, [selected?.pub, selected?.type, selected?.name, selected?.alias]);

  return { chatUserInfo, chatUserAvatar };
};
