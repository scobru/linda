import { useState, useEffect, useRef } from "react";
import { gun, DAPP_NAME } from "linda-protocol";
import { useAppState } from "../context/AppContext";

export const useFriends = () => {
  const [friends, setFriends] = useState([]);
  const { appState } = useAppState();
  const processedIds = useRef(new Set());
  const friendsMap = useRef(new Map());
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!appState.pub) return;

    console.log("Inizializzazione monitoraggio amicizie per:", appState.pub);
    let mounted = true;
    loadingRef.current = true;

    // Funzione per processare un'amicizia
    const processFriendship = async (friendship, id) => {
      // Evita di processare più volte la stessa amicizia
      if (!mounted || !friendship || processedIds.current.has(id)) return;
      processedIds.current.add(id);

      // Verifica che l'amicizia sia valida e attiva
      if (!friendship.status || friendship.status !== "active") return;

      // Determina quale utente è l'amico
      const friendPub =
        friendship.user1 === appState.pub ? friendship.user2 : friendship.user1;
      if (!friendPub) return;

      // Crea subito un oggetto amico base per mostrare qualcosa
      const baseFriend = {
        pub: friendPub,
        friendshipId: id,
        chatId: friendship.chatId || [friendPub, appState.pub].sort().join("_"),
        status: friendship.status,
        created: friendship.created,
        displayName: `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
        alias: `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
      };

      // Aggiorna subito con le info base
      friendsMap.current.set(friendPub, baseFriend);
      updateFriendsList();

      try {
        // Carica le info utente in background
        gun
          .get(DAPP_NAME)
          .get("userList")
          .get("users")
          .get(friendPub)
          .once((userInfo) => {
            if (!mounted || !userInfo) return;

            // Aggiorna con le info complete
            const enrichedFriend = {
              ...baseFriend,
              displayName:
                userInfo.nickname ||
                userInfo.username ||
                baseFriend.displayName,
              nickname: userInfo.nickname,
              username: userInfo.username,
              alias: userInfo.alias || baseFriend.alias,
              avatarSeed: userInfo.avatarSeed,
              lastSeen: userInfo.lastSeen,
              isOnline: userInfo.isOnline,
            };

            friendsMap.current.set(friendPub, enrichedFriend);
            updateFriendsList();
          });
      } catch (error) {
        console.error("Errore nel caricamento info amico:", friendPub, error);
      }
    };

    const updateFriendsList = () => {
      if (!mounted) return;
      const sortedFriends = Array.from(friendsMap.current.values()).sort(
        (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)
      );
      setFriends(sortedFriends);
    };

    // Carica tutte le amicizie in parallelo
    const loadFriendships = () => {
      return new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("friendships")
          .map()
          .once(async (friendship, id) => {
            if (friendship) {
              await processFriendship(friendship, id);
            }
          });
        // Risolvi dopo un breve timeout per dare tempo alle amicizie di caricarsi
        setTimeout(resolve, 100);
      });
    };

    // Esegui il caricamento iniziale
    loadFriendships().then(() => {
      loadingRef.current = false;
      updateFriendsList();
    });

    // Sottoscrizione agli aggiornamenti degli utenti
    const unsubUsers = gun
      .get(DAPP_NAME)
      .get("userList")
      .get("users")
      .map()
      .on((userData, userPub) => {
        if (!mounted || !userData || !friendsMap.current.has(userPub)) return;

        const friend = friendsMap.current.get(userPub);
        if (!friend) return;

        // Aggiorna le info dell'amico
        friendsMap.current.set(userPub, {
          ...friend,
          displayName:
            userData.nickname || userData.username || friend.displayName,
          nickname: userData.nickname,
          username: userData.username,
          alias: userData.alias || friend.alias,
          avatarSeed: userData.avatarSeed,
          lastSeen: userData.lastSeen,
          isOnline: userData.isOnline,
        });

        updateFriendsList();
      });

    return () => {
      console.log("Cleanup sottoscrizioni amici");
      mounted = false;
      loadingRef.current = false;
      processedIds.current.clear();
      friendsMap.current.clear();
      if (typeof unsubUsers === "function") unsubUsers();
    };
  }, [appState.pub]);

  return { friends, loading: loadingRef.current };
};
