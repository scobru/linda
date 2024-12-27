import { useState, useEffect, useRef } from "react";
import { useAppState } from "../context/AppContext";
import { friendsService, userBlocking } from "linda-protocol";
import { gun, DAPP_NAME } from "linda-protocol";
import { userUtils } from "linda-protocol";

export const useFriends = () => {
  const [friends, setFriends] = useState([]);
  const { appState } = useAppState();
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const friendsMapRef = useRef(new Map());
  const unsubscribersRef = useRef(new Map());
  const processedFriendsRef = useRef(new Set());
  const friendsObserverRef = useRef(null);

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

  // Funzione per sottoscriversi allo stato di blocco di un amico
  const subscribeToFriend = (friend) => {
    // Evita sottoscrizioni duplicate
    if (processedFriendsRef.current.has(friend.pub)) return;
    processedFriendsRef.current.add(friend.pub);

    // Rimuovi eventuale vecchia sottoscrizione
    if (unsubscribersRef.current.has(friend.pub)) {
      unsubscribersRef.current.get(friend.pub).unsubscribe();
    }

    const subscription = userBlocking.observeBlockStatus(friend.pub).subscribe({
      next: (status) => {
        const currentFriend = friendsMapRef.current.get(friend.pub);
        if (currentFriend) {
          let shouldUpdate = false;
          const updatedFriend = { ...currentFriend };

          if (status.type === "my_block_status") {
            if (
              updatedFriend.isBlocked !== status.blocked ||
              updatedFriend.canUnblock !== status.canUnblock
            ) {
              updatedFriend.isBlocked = status.blocked;
              updatedFriend.canUnblock = status.canUnblock;
              shouldUpdate = true;
            }
          } else if (status.type === "their_block_status") {
            if (updatedFriend.isBlockedBy !== status.blockedBy) {
              updatedFriend.isBlockedBy = status.blockedBy;
              updatedFriend.canUnblock = false;
              shouldUpdate = true;
            }
          }

          if (shouldUpdate) {
            friendsMapRef.current.set(friend.pub, updatedFriend);
            setFriends(
              Array.from(friendsMapRef.current.values()).sort(
                (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)
              )
            );
          }
        }
      },
      error: (error) => {
        console.error("Errore monitoraggio stato blocco:", error);
      },
    });

    unsubscribersRef.current.set(friend.pub, subscription);
  };

  useEffect(() => {
    if (!appState.pub) {
      mountedRef.current = false;
      return;
    }

    console.log("Inizializzazione monitoraggio amicizie per:", appState.pub);
    mountedRef.current = true;
    loadingRef.current = true;

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

    // Osserva cambiamenti nella lista amici per aggiungere nuove sottoscrizioni
    friendsObserverRef.current = gun
      .get(DAPP_NAME)
      .get("friendships")
      .map()
      .on((friendship, id) => {
        if (!friendship) return;

        let friendPub = null;
        if (friendship.user1 === appState.pub) {
          friendPub = friendship.user2;
        } else if (friendship.user2 === appState.pub) {
          friendPub = friendship.user1;
        }

        if (friendPub && !processedFriendsRef.current.has(friendPub)) {
          const friend = friendsMapRef.current.get(friendPub);
          if (friend) {
            subscribeToFriend(friend);
          }
        }
      });

    // Sottoscrivi agli amici esistenti
    friendsMapRef.current.forEach(subscribeToFriend);

    return () => {
      console.log("Cleanup sottoscrizioni amici");
      mountedRef.current = false;
      loadingRef.current = false;

      // Cleanup delle sottoscrizioni
      unsubscribersRef.current.forEach((unsub) => unsub.unsubscribe());
      unsubscribersRef.current.clear();

      if (typeof unsubFriendships === "function") unsubFriendships();
      if (typeof friendsObserverRef.current === "function")
        friendsObserverRef.current();

      // Non pulire friendsMapRef e processedFriendsRef per mantenere lo stato
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
      const result = await userBlocking.blockUser(friendPub);
      if (result.success) {
        const friend = friendsMapRef.current.get(friendPub);
        if (friend) {
          friendsMapRef.current.set(friendPub, {
            ...friend,
            isBlocked: true,
            canUnblock: true,
          });
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
      const result = await userBlocking.unblockUser(friendPub);
      if (result.success) {
        const friend = friendsMapRef.current.get(friendPub);
        if (friend) {
          friendsMapRef.current.set(friendPub, {
            ...friend,
            isBlocked: false,
            canUnblock: false,
          });
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
