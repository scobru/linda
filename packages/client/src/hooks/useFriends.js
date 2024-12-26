import { useState, useEffect, useRef } from "react";
import { useAppState } from "../context/AppContext";
import { friendsService } from "linda-protocol";
import { gun, DAPP_NAME } from "linda-protocol";
import { userUtils } from "linda-protocol";

export const useFriends = () => {
  const [friends, setFriends] = useState([]);
  const { appState } = useAppState();
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const friendsMapRef = useRef(new Map());

  useEffect(() => {
    if (!appState.pub) return;

    console.log("Inizializzazione monitoraggio amicizie per:", appState.pub);
    loadingRef.current = true;
    mountedRef.current = true;

    // Funzione per aggiornare un amico
    const updateFriend = async (friendPub, friendshipData) => {
      if (!mountedRef.current) return;

      try {
        // Carica le info dell'utente
        const userInfo = await userUtils.getUserInfo(friendPub);
        if (!mountedRef.current) return;

        const friend = {
          pub: friendPub,
          chatId: [friendPub, appState.pub].sort().join("_"),
          displayName:
            userInfo.displayName ||
            userInfo.username ||
            `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
          username: userInfo.username,
          nickname: userInfo.nickname,
          lastSeen: userInfo.lastSeen || Date.now(),
          isOnline: userInfo.isOnline || false,
          isBlocked: friendshipData?.isBlocked || false,
          timestamp: friendshipData?.timestamp || Date.now(),
          status: friendshipData?.status || "accepted",
        };

        friendsMapRef.current.set(friendPub, friend);

        setFriends(
          Array.from(friendsMapRef.current.values()).sort(
            (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)
          )
        );
      } catch (error) {
        console.error("Errore aggiornamento amico:", error);
      }
    };

    // Sottoscrizione alle amicizie
    const unsubFriendships = gun
      .get(DAPP_NAME)
      .get("friendships")
      .map()
      .on((friendship, id) => {
        if (!mountedRef.current || !friendship) return;

        // Verifica che l'amicizia sia valida e coinvolga l'utente corrente
        if (friendship.user1 === appState.pub) {
          updateFriend(friendship.user2, friendship);
        } else if (friendship.user2 === appState.pub) {
          updateFriend(friendship.user1, friendship);
        }
      });

    // Caricamento iniziale degli amici
    const loadInitialFriends = async () => {
      try {
        // Carica tutte le amicizie
        const friendships = await new Promise((resolve) => {
          const results = [];
          gun
            .get(DAPP_NAME)
            .get("friendships")
            .map()
            .once((friendship, id) => {
              if (
                friendship &&
                (friendship.user1 === appState.pub ||
                  friendship.user2 === appState.pub)
              ) {
                results.push({ ...friendship, id });
              }
            });
          setTimeout(() => resolve(results), 1000);
        });

        if (!mountedRef.current) return;

        // Processa ogni amicizia
        for (const friendship of friendships) {
          const friendPub =
            friendship.user1 === appState.pub
              ? friendship.user2
              : friendship.user1;
          await updateFriend(friendPub, friendship);
        }

        loadingRef.current = false;
      } catch (error) {
        console.error("Errore caricamento iniziale amici:", error);
        loadingRef.current = false;
      }
    };

    loadInitialFriends();

    return () => {
      console.log("Cleanup sottoscrizioni amici");
      mountedRef.current = false;
      loadingRef.current = false;
      friendsMapRef.current.clear();
      if (typeof unsubFriendships === "function") unsubFriendships();
    };
  }, [appState.pub]);

  const removeFriend = async (friendPub) => {
    try {
      const result = await friendsService.removeFriend(friendPub);
      if (result.success) {
        friendsMapRef.current.delete(friendPub);
        setFriends(
          Array.from(friendsMapRef.current.values()).sort(
            (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)
          )
        );
      }
      return result;
    } catch (error) {
      console.error("Errore rimozione amico:", error);
      throw error;
    }
  };

  const blockUser = async (friendPub) => {
    try {
      const result = await friendsService.blockUser(friendPub);
      if (result.success) {
        const friend = friendsMapRef.current.get(friendPub);
        if (friend) {
          friendsMapRef.current.set(friendPub, { ...friend, isBlocked: true });
          setFriends(
            Array.from(friendsMapRef.current.values()).sort(
              (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)
            )
          );
        }
      }
      return result;
    } catch (error) {
      console.error("Errore blocco utente:", error);
      throw error;
    }
  };

  const unblockUser = async (friendPub) => {
    try {
      const result = await friendsService.unblockUser(friendPub);
      if (result.success) {
        const friend = friendsMapRef.current.get(friendPub);
        if (friend) {
          friendsMapRef.current.set(friendPub, { ...friend, isBlocked: false });
          setFriends(
            Array.from(friendsMapRef.current.values()).sort(
              (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)
            )
          );
        }
      }
      return result;
    } catch (error) {
      console.error("Errore sblocco utente:", error);
      throw error;
    }
  };

  return {
    friends,
    loading: loadingRef.current,
    removeFriend,
    blockUser,
    unblockUser,
  };
};
