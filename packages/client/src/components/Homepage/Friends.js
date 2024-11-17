import React, { useEffect, useRef } from 'react';
import Context from "../../contexts/context";
import { friends, messaging } from "../../protocol";
import { blocking } from "../../protocol";
import { toast } from "react-hot-toast";
import { gun, user,DAPP_NAME } from "../../protocol"
import acceptFriendRequest from '../../protocol/src/friends/acceptFriendRequest';
import rejectFriendRequest from '../../protocol/src/friends/rejectFriendRequest';

const friendsService = friends.friendsService;
const { userBlocking } = blocking;
const { chat } = messaging;

console.log(friendsService);

export default function Friends({ pendingRequests: externalPendingRequests, onSelect }) {
  const { setFriends: setContextFriends, setSelected } = React.useContext(Context);
  const [friendsList, setFriendsList] = React.useState([]);
  const [pendingRequests, setPendingRequests] = React.useState([]);
  const [processingRequest, setProcessingRequest] = React.useState(false);
  const [activeMenu, setActiveMenu] = React.useState(null);
  const [blockedUsers, setBlockedUsers] = React.useState(new Set());
  const mountedRef = React.useRef(true);
  const blockedUsersRef = useRef(new Set());
  const processedRequestsRef = useRef(new Set());

  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Effetto per sincronizzare le richieste esterne
  useEffect(() => {
    if (externalPendingRequests && mountedRef.current) {
      setPendingRequests(externalPendingRequests);
    }
  }, [externalPendingRequests]);

  // Effetto per monitorare le richieste di amicizia
  useEffect(() => {
    const subscription = friendsService.observeFriendRequests()
      .subscribe({
        next: (request) => {
          if (!mountedRef.current) return;

          // Verifica se la richiesta è già stata processata
          const requestId = `${request.data.from}_${request.data.timestamp}`;
          if (processedRequestsRef.current.has(requestId)) return;

          // Verifica se l'utente è già amico
          const isAlreadyFriend = friendsList.some(f => f.pub === request.data.from);
          if (isAlreadyFriend) {
            // Se è già amico, rimuovi la richiesta
            gun.get(DAPP_NAME)
              .get('all_friend_requests')
              .map()
              .once((req, key) => {
                if (req && req.from === request.data.from) {
                  gun.get(DAPP_NAME)
                    .get('all_friend_requests')
                    .get(key)
                    .put(null);
                }
              });
            return;
          }

          processedRequestsRef.current.add(requestId);
          setPendingRequests(prev => {
            const exists = prev.some(r => r.pub === request.data.from);
            if (!exists) return [...prev, request];
            return prev;
          });
        },
        error: (error) => {
          if (!mountedRef.current) return;
          console.error("Errore monitoraggio richieste:", error);
        }
      });

    return () => subscription.unsubscribe();
  }, [friendsList]);

  // Effetto per monitorare gli utenti bloccati
  useEffect(() => {
    let isSubscribed = true;

    const loadBlockedUsers = async () => {
      try {
        const blockedList = await userBlocking.getBlockedUsers();
        if (!isSubscribed) return;

        const blockedSet = new Set(blockedList.map(user => user.pub));
        setBlockedUsers(blockedSet);
        blockedUsersRef.current = blockedSet;

        // Aggiorna la lista amici per riflettere lo stato di blocco
        setFriendsList(prev => prev.map(friend => ({
          ...friend,
          isBlocked: blockedSet.has(friend.pub)
        })));
      } catch (error) {
        console.error('Error loading blocked users:', error);
      }
    };

    loadBlockedUsers();

    // Ascolta gli eventi di cambio stato utente
    const handleUserStatusChange = async (event) => {
      const { type, userPub } = event.detail;
      
      if (type === 'block') {
        setBlockedUsers(prev => {
          const newSet = new Set(prev);
          newSet.add(userPub);
          blockedUsersRef.current = newSet;
          return newSet;
        });

        setFriendsList(prev => prev.map(friend => 
          friend.pub === userPub ? { ...friend, isBlocked: true } : friend
        ));
      } else if (type === 'unblock') {
        setBlockedUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(userPub);
          blockedUsersRef.current = newSet;
          return newSet;
        });

        setFriendsList(prev => prev.map(friend => 
          friend.pub === userPub ? { ...friend, isBlocked: false } : friend
        ));
      }
    };

    window.addEventListener('userStatusChanged', handleUserStatusChange);

    return () => {
      isSubscribed = false;
      window.removeEventListener('userStatusChanged', handleUserStatusChange);
    };
  }, [setFriendsList]);

  // Nel componente Friends, aggiungi questa funzione per fetchare lo stato di blocco
  const fetchBlockStatus = async (friendPub) => {
    return new Promise((resolve) => {
      let isBlocked = false;
      gun.user()
        .get('blocked_users')
        .map()
        .once((data) => {
          if (data && data.pub === friendPub) {
            isBlocked = true;
          }
        });
      
      // Aggiungi un timeout per assicurarti che tutti i dati siano stati letti
      setTimeout(() => resolve(isBlocked), 500);
    });
  };

  // Funzione per ottenere l'username di un utente
  const getUserUsername = async (userPub) => {
    return new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get('userList')
        .get('users')
        .map()
        .once((userData) => {
          if (userData && userData.pub === userPub) {
            resolve(userData.username);
          }
        });
      
      // Timeout dopo 2 secondi, usa l'alias come fallback
      setTimeout(() => resolve(null), 2000);
    });
  };

  // Aggiungi questa funzione per verificare lo stato di blocco bidirezionale
  const getBlockStatus = async (friendPub) => {
    try {
      const [amIBlocked, didIBlock] = await Promise.all([
        userBlocking.isBlockedBy(friendPub),
        userBlocking.isBlocked(friendPub)
      ]);

      return {
        isBlocked: didIBlock,
        isBlockedBy: amIBlocked
      };
    } catch (error) {
      console.error('Errore nel controllo dello stato di blocco:', error);
      return { isBlocked: false, isBlockedBy: false };
    }
  };

  // Modifica l'effetto che monitora la lista amici per integrare meglio il blocco
  useEffect(() => {
    const processedFriends = new Set();
    
    const subscription = friendsService.observeFriendsList()
      .subscribe({
        next: async (friend) => {
          if (!mountedRef.current) return;
          
          const friendKey = friend.pub;
          
          if (!processedFriends.has(friendKey)) {
            processedFriends.add(friendKey);
            
            // Ottieni l'username e lo stato di blocco
            const [username, blockStatus] = await Promise.all([
              getUserUsername(friend.pub),
              userBlocking.getBlockStatus(friend.pub)
            ]);
            
            // Aggiorna la lista amici solo se lo stato è cambiato
            setFriendsList(prev => {
              const withoutDuplicate = prev.filter(f => f.pub !== friend.pub);
              return [...withoutDuplicate, {
                ...friend,
                alias: username || friend.alias,
                isBlocked: blockStatus.blocked,
                isBlockedBy: blockStatus.blockedBy,
                canInteract: !blockStatus.blocked && !blockStatus.blockedBy
              }].sort((a, b) => (b.added || 0) - (a.added || 0));
            });
          }
        },
        error: (error) => {
          if (!mountedRef.current) return;
          console.error("Errore monitoraggio amici:", error);
          toast.error("Errore nel caricamento degli amici");
        }
      });

    // Sottoscrivi anche agli aggiornamenti dello stato di blocco
    const blockStatusSubscription = gun.get(`${DAPP_NAME}/blockStatus`).map().on(async (status) => {
      if (!status || !mountedRef.current) return;

      // Aggiorna lo stato di blocco nella lista amici
      setFriendsList(prev => prev.map(friend => {
        if (friend.pub === status.blocked || friend.pub === status.blocker) {
          const isBlocked = status.blocker === user.is.pub && status.blocked === friend.pub && status.status === 'blocked';
          const isBlockedBy = status.blocker === friend.pub && status.blocked === user.is.pub && status.status === 'blocked';
          
          return {
            ...friend,
            isBlocked,
            isBlockedBy,
            canInteract: !isBlocked && !isBlockedBy
          };
        }
        return friend;
      }));
    });

    return () => {
      subscription.unsubscribe();
      if (blockStatusSubscription && typeof blockStatusSubscription.off === 'function') {
        blockStatusSubscription.off();
      }
      processedFriends.clear();
    };
  }, []);

  // Aggiungi questo effetto per sincronizzare con il contesto
  useEffect(() => {
    if (setContextFriends && friendsList.length > 0) {
      console.log('Updating context with friends:', friendsList);
      setContextFriends(friendsList);
    }
  }, [friendsList, setContextFriends]);

  // Aggiungi questo effetto per il debug
  useEffect(() => {
    console.log('Current friendsList:', friendsList);
  }, [friendsList]);

  const handleAcceptRequest = async (request) => {
    if (processingRequest) return;
    setProcessingRequest(true);
    
    const toastId = toast.loading("Accettazione richiesta in corso...");
    
    try {
      // Rimuovi immediatamente la richiesta dalla UI e dal database
      setPendingRequests(prev => prev.filter(r => r.pub !== request.pub));

      // Rimuovi la richiesta dal database prima di accettarla
      await new Promise((resolve) => {
        gun.get(DAPP_NAME)
          .get('all_friend_requests')
          .map()
          .once((req, key) => {
            if (req && req.from === request.data.from && req.to === user.is.pub) {
              gun.get(DAPP_NAME)
                .get('all_friend_requests')
                .get(key)
                .put(null);
            }
          });
        setTimeout(resolve, 500);
      });

      // Prepara i dati della richiesta nel formato corretto
      const requestData = {
        pub: request.data.from,
        alias: request.data.senderInfo?.alias || request.data.alias,
        senderInfo: request.data.senderInfo,
        data: request.data
      };

      // Accetta la richiesta di amicizia
      await new Promise((resolve, reject) => {
        acceptFriendRequest(requestData, (result) => {
          if (result.success) {
            resolve(result);
          } else {
            reject(new Error(result.errMessage));
          }
        });
      });

      // Crea la chat dopo aver accettato la richiesta
      const chatId = [user.is.pub, request.data.from].sort().join('_');
      await new Promise((resolve, reject) => {
        messaging.createChat(request.data.from, (response) => {
          if (response.success && response.chat) {
            resolve(response.chat);
          } else {
            reject(new Error(response.errMessage || 'Failed to create chat'));
          }
        });
      });

      // Aggiorna la lista amici
      const newFriend = {
        pub: request.data.from,
        alias: request.data.senderInfo?.alias || request.data.alias,
        added: Date.now(),
        status: 'accepted',
        roomId: chatId
      };

      setFriendsList(prev => [...prev, newFriend]);
      if (setContextFriends) {
        setContextFriends(prev => [...prev, newFriend]);
      }

      toast.success("Richiesta accettata con successo", { id: toastId });
    } catch (error) {
      console.error('Error accepting request:', error);
      
      // Ripristina la richiesta nella lista in caso di errore
      setPendingRequests(prev => {
        const exists = prev.some(r => r.pub === request.pub);
        if (!exists) return [...prev, request];
        return prev;
      });
      
      toast.error(error.message || "Errore nell'accettare la richiesta", { id: toastId });
    } finally {
      setProcessingRequest(false);
      setTimeout(() => toast.dismiss(toastId), 3000);
    }
  };

  const handleRejectRequest = async (request) => {
    if (processingRequest) return;
    setProcessingRequest(true);
    
    const toastId = toast.loading('Rifiuto richiesta in corso...');
    
    try {
      // Rimuovi immediatamente la richiesta dalla UI
      setPendingRequests(prev => prev.filter(r => r.pub !== request.pub));

      // Prepara i dati della richiesta nel formato corretto
      const requestData = {
        from: request.data.from,
        id: request.data.id,
        timestamp: request.data.timestamp
      };

      // Usa rejectFriendRequest con i dati corretti
      await new Promise((resolve, reject) => {
        rejectFriendRequest(requestData, (result) => {
          if (result.success) {
            resolve(result);
          } else {
            reject(new Error(result.errMessage));
          }
        });
      });

      toast.success("Richiesta rifiutata", { id: toastId });
    } catch (error) {
      console.error('Error rejecting request:', error);
      
      // Ripristina la richiesta nella lista in caso di errore
      setPendingRequests(prev => {
        const exists = prev.some(r => r.pub === request.pub);
        if (!exists) return [...prev, request];
        return prev;
      });
      
      toast.error(error.message || "Errore nel rifiutare la richiesta", { id: toastId });
    } finally {
      setProcessingRequest(false);
      setTimeout(() => toast.dismiss(toastId), 3000);
    }
  };

  const handleRemoveFriend = async (friend) => {
    if (window.confirm(`Sei sicuro di voler rimuovere ${friend.alias}?`)) {
      try {
        await friends.removeFriend(friend.pub);
        
        // Aggiorna lo stato locale
        setFriendsList(prev => prev.filter(f => f.pub !== friend.pub));
        setContextFriends(prev => prev.filter(f => f.pub !== friend.pub));
        
        toast.success(`${friend.alias} rimosso dalla lista amici`);
      } catch (error) {
        console.error('Error removing friend:', error);
        toast.error("Errore durante la rimozione dell'amico");
      }
    }
  };

  // Modifica handleBlockFriend per essere più coerente con il sistema di blocco
  const handleBlockFriend = async (friend) => {
    try {
      const result = await userBlocking.blockUser(friend.pub);
      if (result.success) {
        // Aggiorna immediatamente lo stato locale
        setFriendsList(prev => prev.map(f => 
          f.pub === friend.pub ? {
            ...f,
            isBlocked: true,
            canInteract: false
          } : f
        ));
        
        // Aggiorna anche il contesto
        setContextFriends(prev => prev.map(f => 
          f.pub === friend.pub ? {
            ...f,
            isBlocked: true,
            canInteract: false
          } : f
        ));

        setActiveMenu(null);
        toast.success(`${friend.alias} è stato bloccato`);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Error blocking friend:', error);
      toast.error("Errore durante il blocco dell'utente");
    }
  };

  // Modifica handleUnblockFriend per essere più coerente
  const handleUnblockFriend = async (friend) => {
    try {
      const result = await userBlocking.unblockUser(friend.pub);
      if (result.success) {
        // Aggiorna immediatamente lo stato locale
        setFriendsList(prev => prev.map(f => 
          f.pub === friend.pub ? {
            ...f,
            isBlocked: false,
            canInteract: !f.isBlockedBy // Può interagire solo se non è bloccato dall'altro
          } : f
        ));
        
        // Aggiorna anche il contesto
        setContextFriends(prev => prev.map(f => 
          f.pub === friend.pub ? {
            ...f,
            isBlocked: false,
            canInteract: !f.isBlockedBy
          } : f
        ));

        setActiveMenu(null);
        toast.success(`${friend.alias} è stato sbloccato`);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('Error unblocking friend:', error);
      toast.error("Errore durante lo sblocco dell'utente");
    }
  };

  // Modifica l'effetto che monitora lo stato di blocco
  useEffect(() => {
    if (!user.is) return;

    // Monitora i cambiamenti dello stato di blocco globale
    const blockStatusSubscription = gun.get(`${DAPP_NAME}/blockStatus`).map().on(async (status) => {
      if (!status) return;

      // Aggiorna la lista amici quando cambia lo stato di blocco
      setFriendsList(prev => prev.map(friend => {
        // Se sono io che ho bloccato qualcuno
        if (status.blocker === user.is.pub && status.blocked === friend.pub) {
          return {
            ...friend,
            isBlocked: status.status === 'blocked',
            canInteract: status.status !== 'blocked'
          };
        }
        // Se qualcuno mi ha bloccato
        if (status.blocker === friend.pub && status.blocked === user.is.pub) {
          return {
            ...friend,
            isBlockedBy: status.status === 'blocked',
            canInteract: status.status !== 'blocked'
          };
        }
        return friend;
      }));
    });

    // Monitora anche i blocchi nel profilo di ogni amico
    const friendBlockSubscriptions = new Map();

    const setupFriendBlockMonitoring = (friendPub) => {
      if (friendBlockSubscriptions.has(friendPub)) return;

      const subscription = gun.user(friendPub)
        .get('profile')
        .get('blocked')
        .map()
        .on((blockData) => {
          if (blockData && blockData.pub === user.is.pub) {
            setFriendsList(prev => prev.map(friend => 
              friend.pub === friendPub ? {
                ...friend,
                isBlockedBy: blockData.status === 'blocked',
                canInteract: blockData.status !== 'blocked'
              } : friend
            ));
          }
        });

      friendBlockSubscriptions.set(friendPub, subscription);
    };

    // Configura il monitoraggio per gli amici esistenti
    friendsList.forEach(friend => setupFriendBlockMonitoring(friend.pub));

    return () => {
      if (blockStatusSubscription && typeof blockStatusSubscription.off === 'function') {
        blockStatusSubscription.off();
      }
      // Pulisci tutte le sottoscrizioni degli amici
      friendBlockSubscriptions.forEach((subscription) => {
        if (typeof subscription === 'function') {
          subscription();
        }
      });
      friendBlockSubscriptions.clear();
    };
  }, [user.is, friendsList.length]);

  // Componente separato per la richiesta di amicizia
  const FriendRequest = ({ request, onAccept, onReject, processingRequest }) => {
    const [displayName, setDisplayName] = React.useState('Loading...');

    React.useEffect(() => {
      let isMounted = true;
      
      const loadUsername = async () => {
        const username = await getUserUsername(request.data.from);
        if (isMounted) {
          setDisplayName(username || request.data.senderInfo?.alias || 'Unknown');
        }
      };

      loadUsername();

      return () => {
        isMounted = false;
      };
    }, [request]);

    return (
      <div className="flex items-center justify-between p-2 bg-white rounded-lg mb-2 shadow-sm">
        <div className="flex items-center">
          <img
            className="h-10 w-10 rounded-full mr-2"
            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${displayName}&backgroundColor=b6e3f4`}
            alt=""
          />
          <div>
            <span className="font-medium">
              {displayName}
            </span>
            <span className="text-xs text-gray-500 block">
              {request.data.from?.substring(0, 20)}...
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onAccept(request)}
            disabled={processingRequest}
            className={`bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded transition-colors ${
              processingRequest ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {processingRequest ? 'In corso...' : 'Accetta'}
          </button>
          <button
            onClick={() => onReject(request)}
            disabled={processingRequest}
            className={`bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded transition-colors ${
              processingRequest ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            Rifiuta
          </button>
        </div>
      </div>
    );
  };

  // Aggiungi una funzione di debug se necessario
  const debugFriendsList = () => {
    console.log('Current friendsList:', friendsList);
  };

  const handleFriendClick = async (friend) => {
    try {
      // Verifica se l'utente può interagire
      const canInteract = await friendsService.canInteractWith(friend.pub);
      if (!canInteract.canInteract) {
        toast.error('Non puoi interagire con questo utente');
        return;
      }

      // Crea o recupera la chat
      const chatId = [user.is.pub, friend.pub].sort().join('_');
      
      // Crea la chat se non esiste
      const chatResponse = await new Promise((resolve, reject) => {
        messaging.createChat(friend.pub, (response) => {
          console.log('Create chat response:', response);
          if (response.success && response.chat) {
            resolve(response.chat);
          } else {
            reject(new Error(response.errMessage || 'Failed to create chat'));
          }
        });
      });

      console.log('Chat created/retrieved:', chatResponse);

      // Prepara i dati della chat nel formato corretto
      const chatData = {
        ...friend,
        roomId: chatResponse.roomId || chatId,
        type: 'private',
        pub: friend.pub,
        isGroup: false,
        chat: {
          ...chatResponse,
          id: chatResponse.roomId || chatId,
          user1: user.is.pub,
          user2: friend.pub,
          created: chatResponse.created || Date.now(),
          status: 'active'
        }
      };

      console.log('Selecting chat with data:', chatData);
      
      // Verifica che la chat sia stata creata correttamente
      const existingChat = await new Promise((resolve) => {
        gun.get(DAPP_NAME)
          .get('chats')
          .get(chatData.roomId)
          .once((chat) => resolve(chat));
      });

      if (!existingChat) {
        // Se la chat non esiste nel database, creala
        await gun.get(DAPP_NAME)
          .get('chats')
          .get(chatData.roomId)
          .put({
            id: chatData.roomId,
            user1: user.is.pub,
            user2: friend.pub,
            created: Date.now(),
            status: 'active'
          });
      }

      // Seleziona la chat
      onSelect(chatData);

    } catch (error) {
      console.error('Error handling friend click:', error);
      toast.error('Errore nell\'apertura della chat');
    }
  };

  const handleCreateChat = async (pub) => {
    try {
      const result = await new Promise((resolve) => {
        chat.createChat(pub, (response) => {
          resolve(response);
        });
      });

      if (result.success) {
        // ... resto del codice ...
      }
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Aggiungi pulsante debug in modalità development */}
      {process.env.NODE_ENV === 'development' && (
        <button 
          onClick={debugFriendsList}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Debug Friends
        </button>
      )}

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="p-2 bg-gray-100 text-xs">
          <p>Pending Requests: {pendingRequests.length}</p>
          <p>Friends List: {friendsList.length}</p>
          <p>Friends Data: {JSON.stringify(friendsList.map(f => f.alias))}</p>
        </div>
      )}

      {/* Richieste in sospeso */}
      {pendingRequests.length > 0 && (
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">
            Richieste di amicizia ({pendingRequests.length})
          </h3>
          {pendingRequests.map(request => (
            <FriendRequest
              key={request.key || request.pub}
              request={request}
              onAccept={handleAcceptRequest}
              onReject={handleRejectRequest}
              processingRequest={processingRequest}
            />
          ))}
        </div>
      )}

      {/* Lista amici */}
      {friendsList.length > 0 && (
        <div className="flex flex-col divide-y">
          {friendsList.map((friend) => {
            const avatarSeed = friend.isBlocked || friend.isBlockedBy ? 
              `blocked_${friend.alias}` : friend.alias;

            return (
              <div key={friend.pub} className="hover:bg-blue-100/50 py-2 px-4 rounded cursor-pointer relative group">
                <div className="flex items-center justify-between">
                  <div 
                    className={`flex items-center flex-1 ${(friend.isBlocked || friend.isBlockedBy) ? 'opacity-50' : ''}`}
                    onClick={() => !friend.isBlocked && !friend.isBlockedBy && handleFriendClick(friend)}
                  >
                    <img
                      className="h-10 w-10 rounded-full mr-2"
                      src={`https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed}&backgroundColor=${(friend.isBlocked || friend.isBlockedBy) ? 'gray' : 'b6e3f4'}`}
                      alt=""
                    />
                    <div>
                      <span className="font-medium">{friend.alias}</span>
                      <span className="text-xs text-gray-500 block">
                        {friend.pub?.substring(0, 20)}...
                      </span>
                      {friend.isBlocked && (
                        <div className="flex items-center mt-1">
                          <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
                            Hai bloccato questo utente
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnblockFriend(friend);
                            }}
                            className="ml-2 text-xs text-blue-500 hover:text-blue-600"
                          >
                            Sblocca
                          </button>
                        </div>
                      )}
                      {friend.isBlockedBy && !friend.isBlocked && (
                        <div className="mt-1">
                          <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
                            Sei stato bloccato da questo utente
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Menu azioni */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      className="p-1 hover:bg-gray-200 rounded-full"
                      onClick={() => setActiveMenu(activeMenu === friend.pub ? null : friend.pub)}
                    >
                      ⋮
                    </button>
                    
                    {activeMenu === friend.pub && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50">
                        <div className="py-1">
                          <button
                            onClick={() => {
                              handleRemoveFriend(friend);
                              setActiveMenu(null);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            Rimuovi amico
                          </button>
                          {!friend.isBlocked && !friend.isBlockedBy && (
                            <button
                              onClick={() => handleBlockFriend(friend)}
                              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              Blocca utente
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {friend.isBlocked && (
                  <div className="text-xs text-red-500 mt-1">
                    Non puoi inviare messaggi a questo utente finché non lo sblocchi
                  </div>
                )}
                {friend.isBlockedBy && !friend.isBlocked && (
                  <div className="text-xs text-red-500 mt-1">
                    Non puoi inviare messaggi a questo utente perché ti ha bloccato
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stato vuoto */}
      {pendingRequests.length === 0 && friendsList.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          Nessun amico o richiesta trovata
        </div>
      )}
    </div>
  );
}
