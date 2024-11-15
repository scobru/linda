import React, { useEffect, useRef } from 'react';
import Context from "../../contexts/context";
import { friends, messaging } from "linda-protocol";
import { blocking } from "linda-protocol";
import { toast } from "react-hot-toast";
import { gun, user } from "linda-protocol"

const friendsService = friends.friendsService;
const { userBlocking } = blocking;

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
          setPendingRequests(prev => {
            const exists = prev.some(r => r.pub === request.pub);
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
  }, []);

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

  // Modifica l'effetto che monitora la lista amici
  useEffect(() => {
    const processedFriends = new Set();
    
    const subscription = friendsService.observeFriendsList()
      .subscribe({
        next: async (friend) => {
          if (!mountedRef.current) return;
          
          const friendKey = friend.pub;
          
          if (!processedFriends.has(friendKey)) {
            processedFriends.add(friendKey);
            
            // Verifica lo stato di blocco per questo amico
            const isBlocked = await fetchBlockStatus(friend.pub);
            console.log(`Block status for ${friend.alias}:`, isBlocked); // Debug log
            
            setFriendsList(prev => {
              const withoutDuplicate = prev.filter(f => f.pub !== friend.pub);
              return [...withoutDuplicate, {
                ...friend,
                isBlocked
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

    // Aggiungi un effetto di cleanup per la lista amici
    const cleanupFriendsList = async () => {
      // Verifica e aggiorna lo stato di blocco per tutti gli amici esistenti
      const updatedFriends = await Promise.all(
        friendsList.map(async (friend) => {
          const isBlocked = await fetchBlockStatus(friend.pub);
          return { ...friend, isBlocked };
        })
      );

      if (mountedRef.current) {
        setFriendsList(updatedFriends);
      }
    };

    // Esegui il cleanup iniziale
    cleanupFriendsList();

    return () => {
      subscription.unsubscribe();
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
      // Rimuovi immediatamente la richiesta dalla UI
      setPendingRequests(prev => prev.filter(r => r.pub !== request.pub));

      await friendsService.handleAcceptRequest(request);
      await friends.acceptFriendRequest(request);

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
      await friendsService.handleRejectRequest(request);
      setPendingRequests(prev => prev.filter(r => r.pub !== request.pub));
      toast.success("Richiesta rifiutata", { id: toastId });
    } catch (error) {
      console.error('Error rejecting request:', error);
      toast.error("Errore nel rifiutare la richiesta", { id: toastId });
    } finally {
      setProcessingRequest(false);
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

  const handleBlockFriend = async (friend) => {
    try {
      await userBlocking.blockUser(friend.pub);
      
      // Aggiorna immediatamente lo stato locale
      setFriendsList(prev => prev.map(f => 
        f.pub === friend.pub ? { ...f, isBlocked: true } : f
      ));
      
      // Emetti l'evento di blocco
      window.dispatchEvent(new CustomEvent('userStatusChanged', {
        detail: {
          type: 'block',
          userPub: friend.pub,
          timestamp: Date.now()
        }
      }));

      toast.success(`${friend.alias} è stato bloccato`);
    } catch (error) {
      console.error('Error blocking friend:', error);
      toast.error("Errore durante il blocco dell'utente");
    }
  };

  const handleUnblockFriend = async (friend) => {
    try {
      await userBlocking.unblockUser(friend.pub);
      
      // Aggiorna immediatamente lo stato locale
      setFriendsList(prev => prev.map(f => 
        f.pub === friend.pub ? { ...f, isBlocked: false } : f
      ));
      
      // Emetti l'evento di sblocco
      window.dispatchEvent(new CustomEvent('userStatusChanged', {
        detail: {
          type: 'unblock',
          userPub: friend.pub,
          timestamp: Date.now()
        }
      }));

      toast.success(`${friend.alias} è stato sbloccato`);
    } catch (error) {
      console.error('Error unblocking friend:', error);
      toast.error("Errore durante lo sblocco dell'utente");
    }
  };

  // Componente separato per la richiesta di amicizia
  const FriendRequest = ({ request, onAccept, onReject, processingRequest }) => {
    const [alias, setAlias] = React.useState('Loading...');

    React.useEffect(() => {
      let isMounted = true;
      
      const loadAlias = async () => {
        const resolvedAlias = await friendsService.getRequestAlias(request);
        if (isMounted) {
          setAlias(resolvedAlias);
        }
      };

      loadAlias();

      return () => {
        isMounted = false;
      };
    }, [request]);

    return (
      <div className="flex items-center justify-between p-2 bg-white rounded-lg mb-2 shadow-sm">
        <div className="flex items-center">
          <img
            className="h-10 w-10 rounded-full mr-2"
            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${alias}&backgroundColor=b6e3f4`}
            alt=""
          />
          <div>
            <span className="font-medium">
              {alias}
            </span>
            <span className="text-xs text-gray-500 block">
              {request.pub?.substring(0, 20)}...
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
    console.log('Friend clicked:', friend);
    
    try {
      if (!friend.pub) {
        throw new Error('Invalid friend data');
      }

      // Crea la chat prima di selezionare l'amico
      const chat = await new Promise((resolve, reject) => {
        console.log("CREATING CHAT", friend.pub)
        messaging.createChat(friend.pub, (response) => {
          console.log('Create chat response:', response);
          if (response.success && response.chat) {
            resolve(response.chat);
          } else {
            reject(new Error(response.errMessage || 'Failed to create chat'));
          }
        });
      });

      console.log('Chat created successfully:', chat); // Debug log

      // Prepara i dati dell'amico con la chat
      const friendData = {
        ...friend,
        type: 'friend',
        isFriend: true,
        chat: chat,
        roomId: chat.roomId || chat.id // Usa chat.id come fallback
      };

      console.log('Selecting friend with data:', friendData);
      
      // Usa il callback onSelect per aggiornare il contesto
      
      await onSelect(friendData);
      
    } catch (error) {
      console.error('Error selecting friend:', error);
      toast.error("Errore nella selezione dell'amico");
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
          {friendsList.map((friend) => (
            <div
              key={friend.pub}
              className="hover:bg-blue-100/50 py-2 px-4 rounded cursor-pointer relative group"
            >
              <div className="flex items-center justify-between">
                <div 
                  className={`flex items-center flex-1 ${friend.isBlocked ? 'opacity-50' : ''}`}
                  onClick={() => !friend.isBlocked && handleFriendClick(friend)}
                >
                  <img
                    className="h-10 w-10 rounded-full mr-2"
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${friend.alias}&backgroundColor=b6e3f4`}
                    alt=""
                  />
                  <div>
                    <span className="font-medium">{friend.alias}</span>
                    <span className="text-xs text-gray-500 block">
                      {friend.pub?.substring(0, 20)}...
                    </span>
                    {friend.isBlocked && (
                      <span className="text-xs text-red-500 bg-red-100 px-2 py-0.5 rounded-full mt-1">
                        Utente bloccato
                      </span>
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
                            setActiveMenu(null);
                            handleRemoveFriend(friend);
                          }}
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Rimuovi amico
                        </button>
                        {friend.isBlocked ? (
                          <button
                            onClick={() => {
                              setActiveMenu(null);
                              handleUnblockFriend(friend);
                            }}
                            className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                          >
                            Sblocca utente
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setActiveMenu(null);
                              handleBlockFriend(friend);
                            }}
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
            </div>
          ))}
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
