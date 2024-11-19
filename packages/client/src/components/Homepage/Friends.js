import React from 'react';
import { gun, user, DAPP_NAME } from '../../protocol';
import { userUtils } from '../../protocol/src/utils/userUtils';
import { removeFriend, acceptFriendRequest, rejectFriendRequest } from '../../protocol/src/friends';
import { toast } from 'react-hot-toast';

// Componente per la richiesta di amicizia
const FriendRequest = ({ request, onRequestProcessed }) => {
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [displayName, setDisplayName] = React.useState('Unknown');

  // Effetto per caricare il nome dell'utente che ha inviato la richiesta
  React.useEffect(() => {
    const loadSenderName = async () => {
      try {
        // Ottieni il nome dal nodo userList/users
        const userData = await new Promise((resolve) => {
          gun.get(DAPP_NAME)
            .get('userList')
            .get('users')
            .get(request.from)
            .once((data) => {
              resolve(data);
            });
        });

        if (userData?.nickname) {
          setDisplayName(userData.nickname);
          return;
        }

        // Prova a ottenere il nickname
        const nickname = await new Promise((resolve) => {
          gun.get(DAPP_NAME)
            .get('userList')
            .get('nicknames')
            .get(request.from)
            .once((data) => {
              resolve(data);
            });
        });

        if (nickname) {
          setDisplayName(nickname);
          return;
        }

        // Fallback all'alias originale
        const user = await gun.get(`~${request.from}`).once();
        if (user?.alias) {
          setDisplayName(user.alias.split('.')[0]);
          return;
        }

        // Fallback finale alla chiave pubblica abbreviata
        setDisplayName(`${request.from.slice(0, 6)}...${request.from.slice(-4)}`);
      } catch (error) {
        console.error('Errore nel caricamento del nome:', error);
      }
    };

    loadSenderName();
  }, [request.from]);

  const handleAccept = async () => {
    try {
      setIsProcessing(true);
      const result = await acceptFriendRequest(request);
      
      if (result.success) {
        // Rimuovi immediatamente la richiesta dall'UI
        onRequestProcessed(request.from);

        // Rimuovi la richiesta da Gun
        gun.get(DAPP_NAME)
          .get('all_friend_requests')
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun.get(DAPP_NAME)
                .get('all_friend_requests')
                .get(key)
                .put(null);
            }
          });

        gun.get(DAPP_NAME)
          .get('friend_requests')
          .get(user.is.pub)
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun.get(DAPP_NAME)
                .get('friend_requests')
                .get(user.is.pub)
                .get(key)
                .put(null);
            }
          });

        toast.success('Richiesta di amicizia accettata');
      }
    } catch (error) {
      console.error('Errore accettazione richiesta:', error);
      toast.error('Errore nell\'accettare la richiesta');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      await rejectFriendRequest(request);

      // Rimuovi immediatamente la richiesta dall'UI
      onRequestProcessed(request.from);

      // Rimuovi la richiesta da Gun
      gun.get(DAPP_NAME)
        .get('all_friend_requests')
        .map()
        .once((data, key) => {
          if (data && data.from === request.from) {
            gun.get(DAPP_NAME)
              .get('all_friend_requests')
              .get(key)
              .put(null);
          }
        });

      gun.get(DAPP_NAME)
        .get('friend_requests')
        .get(user.is.pub)
        .map()
        .once((data, key) => {
          if (data && data.from === request.from) {
            gun.get(DAPP_NAME)
              .get('friend_requests')
              .get(user.is.pub)
              .get(key)
              .put(null);
          }
        });

      toast.success('Richiesta di amicizia rifiutata');
    } catch (error) {
      console.error('Errore rifiuto richiesta:', error);
      toast.error('Errore nel rifiutare la richiesta');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm mb-2">
      <div className="flex items-center">
        <img
          className="h-10 w-10 rounded-full"
          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${displayName}&backgroundColor=b6e3f4`}
          alt=""
        />
        <div className="ml-3">
          <p className="text-sm font-medium text-gray-900">
            {displayName}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(request.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleAccept}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? 'In corso...' : 'Accetta'}
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Rifiuta
        </button>
      </div>
    </div>
  );
};

export default function Friends({ onSelect, loading, selectedUser }) {
  const [friends, setFriends] = React.useState([]);
  const [pendingRequests, setPendingRequests] = React.useState([]);
  const friendsRef = React.useRef(new Map());
  const [activeMenu, setActiveMenu] = React.useState(null);

  // Funzione per gestire la rimozione delle richieste processate
  const handleRequestProcessed = (fromPub) => {
    // Rimuovi immediatamente la richiesta dalla lista locale
    setPendingRequests(prev => prev.filter(r => r.from !== fromPub));
  };

  React.useEffect(() => {
    if (!user?.is) return;

    let mounted = true;
    const unsubscribers = new Map();

    const updateFriendData = async (friendPub) => {
      if (!mounted) return;
      
      // Sottoscrizione al nickname dell'amico
      const unsubNickname = gun.get(DAPP_NAME)
        .get('userList')
        .get('nicknames')
        .get(friendPub)
        .on((nickname) => {
          if (!mounted) return;
          
          setFriends(prev => prev.map(friend => {
            if (friend.pub === friendPub) {
              return {
                ...friend,
                alias: nickname || `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`
              };
            }
            return friend;
          }));
        });

      unsubscribers.set(friendPub, unsubNickname);
    };

    // Monitora la lista amici
    const unsubFriendships = gun.get(DAPP_NAME)
      .get('friendships')
      .map()
      .on((friendship, id) => {
        if (!friendship || !mounted) return;

        if (friendship.user1 === user.is.pub || friendship.user2 === user.is.pub) {
          const friendPub = friendship.user1 === user.is.pub ? friendship.user2 : friendship.user1;
          
          if (!friendsRef.current.has(friendPub)) {
            friendsRef.current.set(friendPub, true);
            
            // Aggiorna la lista amici
            setFriends(prev => {
              const exists = prev.some(f => f.pub === friendPub);
              if (!exists) {
                return [...prev, {
                  pub: friendPub,
                  alias: `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
                  friendshipId: id,
                  added: friendship.created,
                  type: 'friend'
                }];
              }
              return prev;
            });

            // Sottoscrivi agli aggiornamenti del nickname
            updateFriendData(friendPub);
          }
        }
      });

    return () => {
      mounted = false;
      unsubscribers.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
      if (typeof unsubFriendships === 'function') unsubFriendships();
      friendsRef.current.clear();
    };
  }, [user?.is]);

  React.useEffect(() => {
    if (!user?.is) return;

    const unsubRequests = gun.get(DAPP_NAME)
      .get('all_friend_requests')
      .map()
      .on((request) => {
        if (request && request.to === user.is.pub) {
          setPendingRequests(prev => {
            const exists = prev.some(r => r.from === request.from);
            if (!exists) {
              return [...prev, request];
            }
            return prev;
          });
        }
      });

    return () => {
      if (typeof unsubRequests === 'function') {
        unsubRequests();
      }
    };
  }, []);

  const handleRemoveFriend = async (friend) => {
    try {
      if (window.confirm('Sei sicuro di voler rimuovere questo amico?')) {
        await removeFriend(friend.pub);
        toast.success('Amico rimosso con successo');
        // La lista amici si aggiornerà automaticamente tramite le sottoscrizioni
      }
    } catch (error) {
      console.error('Errore rimozione amico:', error);
      toast.error('Errore durante la rimozione');
    }
  };

  const renderFriend = (friend) => {
    const isSelected = selectedUser?.pub === friend.pub;

    return (
      <div
        key={friend.pub}
        className={`relative flex items-center p-3 hover:bg-gray-50 cursor-pointer ${
          isSelected ? 'bg-blue-50' : ''
        }`}
      >
        <div 
          className="flex-1 flex items-center"
          onClick={() => onSelect(friend)}
        >
          <div className="flex-shrink-0">
            <img
              className="h-10 w-10 rounded-full"
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${friend.alias}&backgroundColor=b6e3f4`}
              alt=""
            />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {friend.alias || 'Caricamento...'}
            </p>
            <p className="text-xs text-gray-500">
              {friend.pub.slice(0, 8)}...
            </p>
          </div>
        </div>

        {/* Menu contestuale */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button 
            className="p-2 hover:bg-gray-100 rounded-full"
            onClick={() => setActiveMenu(activeMenu === friend.pub ? null : friend.pub)}
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
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
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Richieste in sospeso */}
      {pendingRequests?.length > 0 && (
        <div className="p-4 bg-yellow-50 rounded-lg">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">
            Richieste di amicizia ({pendingRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <FriendRequest
                key={request.pub || request.from}
                request={request}
                onRequestProcessed={handleRequestProcessed}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lista amici */}
      <div className="divide-y divide-gray-200">
        {friends.map(renderFriend)}
      </div>

      {/* Stato vuoto */}
      {!loading && friends.length === 0 && pendingRequests?.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          Nessun amico trovato
        </div>
      )}
    </div>
  );
}
