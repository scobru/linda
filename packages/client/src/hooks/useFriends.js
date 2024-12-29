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
      console.log(
        "Inizio updateFriend per:",
        friendPub,
        "con dati:",
        friendshipData
      );

      if (!friendshipData || friendshipData.status === "removed") {
        console.log("Rimuovendo amico dalla mappa locale:", friendPub);
        friendsMapRef.current.delete(friendPub);
        // Rimuovi la sottoscrizione
        if (unsubscribersRef.current.has(friendPub)) {
          unsubscribersRef.current.get(friendPub).unsubscribe();
          unsubscribersRef.current.delete(friendPub);
        }
        // Rimuovi dalla lista dei processati
        processedFriendsRef.current.delete(friendPub);

        const updatedFriends = Array.from(friendsMapRef.current.values())
          .filter((f) => f.status !== "removed")
          .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

        console.log("Lista amici dopo rimozione:", updatedFriends);
        setFriends(updatedFriends);
        return;
      }

      // Carica le info dell'utente con retry
      let userInfo = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (!userInfo && retryCount < maxRetries) {
        try {
          console.log(
            `Tentativo ${retryCount + 1} di caricamento info utente per:`,
            friendPub
          );
          userInfo = await userUtils.getUserInfo(friendPub);
          if (!userInfo) {
            throw new Error("UserInfo vuoto");
          }
        } catch (error) {
          console.error(`Errore tentativo ${retryCount + 1}:`, error);
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * retryCount)
            );
          }
        }
      }

      if (!mountedRef.current) return;

      if (!userInfo) {
        console.warn(
          "Impossibile caricare le info utente dopo",
          maxRetries,
          "tentativi"
        );
        userInfo = {
          displayName: `Utente ${friendPub.slice(0, 6)}...${friendPub.slice(
            -4
          )}`,
          lastSeen: Date.now(),
        };
      }

      console.log("Info utente caricate:", userInfo);

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
        status: friendshipData?.status || "active",
      };

      // Solo se l'amico non è rimosso, aggiungilo alla mappa
      if (friend.status !== "removed") {
        console.log("Aggiungendo/Aggiornando amico nella mappa:", friend);
        friendsMapRef.current.set(friendPub, friend);

        const updatedFriends = Array.from(friendsMapRef.current.values())
          .filter((f) => f.status !== "removed")
          .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

        console.log("Lista amici dopo aggiornamento:", updatedFriends);
        setFriends(updatedFriends);
      } else {
        console.log(
          "Amico marcato come rimosso, non aggiunto alla lista:",
          friend
        );
      }
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

    // 1. Sottoscrizione al nodo friendships
    const unsubFriendships = gun
      .get(DAPP_NAME)
      .get("friendships")
      .map()
      .on(async (friendship, id) => {
        if (!mountedRef.current) return;

        // Verifica che l'amicizia sia valida e coinvolga l'utente corrente
        if (friendship) {
          const isCurrentUser =
            friendship.user1 === appState.pub ||
            friendship.user2 === appState.pub;

          if (isCurrentUser) {
            const friendPub =
              friendship.user1 === appState.pub
                ? friendship.user2
                : friendship.user1;

            if (friendship.status === "removed") {
              console.log("Amicizia rimossa, rimuovo dalla lista:", friendPub);
              updateFriend(friendPub, null);
            } else {
              updateFriend(friendPub, friendship);
            }
          }
        }
      });

    // 2. Sottoscrizione al nodo friends (vecchio nodo)
    const unsubFriendsOld = gun
      .get(DAPP_NAME)
      .get("friends")
      .get(appState.pub)
      .map()
      .on((isFriend, friendPub) => {
        if (!mountedRef.current) return;

        if (isFriend === true) {
          // Verifica prima nel nodo friendships
          gun
            .get(DAPP_NAME)
            .get("friendships")
            .map()
            .once((friendship) => {
              if (
                friendship &&
                ((friendship.user1 === friendPub &&
                  friendship.user2 === appState.pub) ||
                  (friendship.user2 === friendPub &&
                    friendship.user1 === appState.pub))
              ) {
                // Se esiste un'amicizia nel nodo friendships, usa quello stato
                if (friendship.status === "removed") {
                  updateFriend(friendPub, null);
                } else {
                  updateFriend(friendPub, friendship);
                }
              } else {
                // Se non esiste nel nodo friendships, usa i dati base
                updateFriend(friendPub, { status: "active" });
              }
            });
        } else if (isFriend === null) {
          updateFriend(friendPub, null);
        }
      });

    // Caricamento iniziale degli amici
    const loadInitialFriends = async () => {
      try {
        console.log("Inizio caricamento iniziale amici");

        // Carica prima tutte le amicizie rimosse
        const removedFriendships = new Set();
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("friendships")
            .map()
            .once((friendship) => {
              if (
                friendship &&
                friendship.status === "removed" &&
                (friendship.user1 === appState.pub ||
                  friendship.user2 === appState.pub)
              ) {
                const friendPub =
                  friendship.user1 === appState.pub
                    ? friendship.user2
                    : friendship.user1;
                removedFriendships.add(friendPub);
              }
            });
          setTimeout(resolve, 1000);
        });

        // Carica le amicizie attive, escludendo quelle rimosse
        const [friendships, oldFriends] = await Promise.all([
          new Promise((resolve) => {
            const results = [];
            gun
              .get(DAPP_NAME)
              .get("friendships")
              .map()
              .once((friendship, id) => {
                console.log("Friendship trovata:", friendship);
                if (
                  friendship &&
                  friendship.status !== "removed" &&
                  (friendship.user1 === appState.pub ||
                    friendship.user2 === appState.pub)
                ) {
                  const friendPub =
                    friendship.user1 === appState.pub
                      ? friendship.user2
                      : friendship.user1;

                  if (!removedFriendships.has(friendPub)) {
                    results.push({ ...friendship, id });
                  }
                }
              });
            setTimeout(() => {
              console.log("Friendships caricate:", results);
              resolve(results);
            }, 1000);
          }),
          new Promise((resolve) => {
            const results = [];
            gun
              .get(DAPP_NAME)
              .get("friends")
              .get(appState.pub)
              .map()
              .once((isFriend, friendPub) => {
                console.log("Friend trovato:", friendPub, isFriend);
                if (isFriend === true && !removedFriendships.has(friendPub)) {
                  results.push({ pub: friendPub, status: "active" });
                }
              });
            setTimeout(() => {
              console.log("Friends caricati:", results);
              resolve(results);
            }, 1000);
          }),
        ]);

        if (!mountedRef.current) return;

        // Pulisci la lista corrente
        friendsMapRef.current.clear();
        processedFriendsRef.current.clear();

        // Unisci i risultati dando priorità al nodo friendships
        const allFriends = [...friendships];
        for (const oldFriend of oldFriends) {
          if (
            !allFriends.some(
              (f) =>
                (f.user1 === oldFriend.pub && f.user2 === appState.pub) ||
                (f.user2 === oldFriend.pub && f.user1 === appState.pub)
            ) &&
            !removedFriendships.has(oldFriend.pub)
          ) {
            allFriends.push(oldFriend);
          }
        }

        console.log("Lista completa amici da processare:", allFriends);

        // Processa ogni amicizia
        for (const friendship of allFriends) {
          const friendPub =
            friendship.user1 === appState.pub
              ? friendship.user2
              : friendship.user1 || friendship.pub;

          if (!removedFriendships.has(friendPub)) {
            await updateFriend(friendPub, friendship);
          }
        }

        loadingRef.current = false;
      } catch (error) {
        console.error("Errore caricamento iniziale amici:", error);
        loadingRef.current = false;
      }
    };

    loadInitialFriends();

    // Cleanup
    return () => {
      console.log("Cleanup sottoscrizioni amici");
      mountedRef.current = false;
      loadingRef.current = false;

      // Cleanup delle sottoscrizioni
      unsubscribersRef.current.forEach((unsub) => unsub.unsubscribe());
      unsubscribersRef.current.clear();

      if (typeof unsubFriendships === "function") unsubFriendships();
      if (typeof unsubFriendsOld === "function") unsubFriendsOld();

      // Pulisci tutte le ref
      friendsMapRef.current.clear();
      processedFriendsRef.current.clear();
    };
  }, [appState.pub]);

  const removeFriend = async (friendPub) => {
    try {
      const result = await friendsService.removeFriend(friendPub);
      if (result.success) {
        console.log("Rimuovo amico dalla lista locale:", friendPub);

        // 1. Rimuovi completamente dal nodo friends
        console.log("Rimuovo dal nodo friends");
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("friends")
            .get(appState.pub)
            .get(friendPub)
            .put(null, (ack) => {
              if (ack.err)
                console.error("Errore rimozione friends 1:", ack.err);
              gun
                .get(DAPP_NAME)
                .get("friends")
                .get(friendPub)
                .get(appState.pub)
                .put(null, (ack) => {
                  if (ack.err)
                    console.error("Errore rimozione friends 2:", ack.err);
                  resolve();
                });
            });
        });

        // 2. Rimuovi completamente dal nodo friendships
        console.log("Rimuovo dal nodo friendships");
        const friendshipNode = gun.get(DAPP_NAME).get("friendships");

        // Cerca e rimuovi tutte le amicizie correlate
        await new Promise((resolve) => {
          let found = false;
          friendshipNode.map().once((friendship, id) => {
            if (
              friendship &&
              ((friendship.user1 === friendPub &&
                friendship.user2 === appState.pub) ||
                (friendship.user2 === friendPub &&
                  friendship.user1 === appState.pub))
            ) {
              found = true;
              console.log("Rimuovo amicizia:", id);

              // Rimuovi completamente il nodo
              friendshipNode.get(id).put(null);

              // Rimuovi anche i dati associati
              const chatId = [friendPub, appState.pub].sort().join("_");

              // Rimuovi la chat
              gun.get(DAPP_NAME).get("chats").get(chatId).put(null);

              // Rimuovi i messaggi
              gun.get(DAPP_NAME).get("messages").get(chatId).put(null);
            }
          });

          setTimeout(() => {
            if (!found) {
              console.warn("Nessuna amicizia trovata da rimuovere");
            }
            resolve();
          }, 2000);
        });

        // 3. Rimuovi completamente le richieste di amicizia
        console.log("Rimuovo richieste di amicizia");
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("friendRequests")
            .get(appState.pub)
            .get(friendPub)
            .put(null);

          gun
            .get(DAPP_NAME)
            .get("friendRequests")
            .get(friendPub)
            .get(appState.pub)
            .put(null);

          setTimeout(resolve, 1000);
        });

        // 4. Verifica finale
        const friendshipRemoved = await new Promise((resolve) => {
          let activeFound = false;
          friendshipNode.map().once((friendship) => {
            if (
              friendship &&
              ((friendship.user1 === friendPub &&
                friendship.user2 === appState.pub) ||
                (friendship.user2 === friendPub &&
                  friendship.user1 === appState.pub))
            ) {
              activeFound = true;
            }
          });

          setTimeout(() => resolve(!activeFound), 2000);
        });

        if (!friendshipRemoved) {
          console.warn(
            "L'amicizia potrebbe non essere stata rimossa completamente"
          );
          throw new Error("Rimozione amicizia non completata");
        }

        console.log("Amicizia rimossa con successo da tutti i nodi");

        // 5. Aggiorna lo stato locale
        friendsMapRef.current.delete(friendPub);
        if (unsubscribersRef.current.has(friendPub)) {
          unsubscribersRef.current.get(friendPub).unsubscribe();
          unsubscribersRef.current.delete(friendPub);
        }
        processedFriendsRef.current.delete(friendPub);

        const updatedFriends = Array.from(friendsMapRef.current.values())
          .filter((friend) => friend.pub !== friendPub)
          .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

        setFriends(updatedFriends);
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
