import React, { useEffect, useRef } from 'react';
import Context from '../contexts/context';
import { messaging } from '../protocol';
import { toast } from 'react-hot-toast';
import { gun, user } from '../protocol';
// compos
import Friends from '../components/Homepage/Friends';
import Profile from '../components/Homepage/Profile';
import AddFriend from '../components/Homepage/AddFriend';
import Messages from '../components/Homepage/Messages';
import AppStatus from '../components/AppStatus';
import { useNavigate } from 'react-router-dom';
import { authentication } from '../protocol/src';
import Groups from '../components/Homepage/Groups';

export default function Homepage() {
  const [isShown, setIsShown] = React.useState(false);
  const { setFriends, setSelected, selected, setConnectionState } = React.useContext(Context);
  const [pendingRequests, setPendingRequests] = React.useState([]);
  const processedRequestsRef = React.useRef(new Set());
  const friendsRef = React.useRef(new Set());
  const [isProcessingRequest, setIsProcessingRequest] = React.useState(false);
  const subscriptions = useRef({});
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const selectedRef = useRef(null);
  const [chatInitialized, setChatInitialized] = React.useState(false);
  const chatInitializedRef = useRef(false);
  const [currentChatData, setCurrentChatData] = React.useState(null);
  const [activeView, setActiveView] = React.useState('chats');

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Monitora lo stato della connessione
  React.useEffect(() => {
    if (!setConnectionState) return;

    const handleConnect = () => setConnectionState('connected');
    const handleDisconnect = () => setConnectionState('disconnected');

    gun.on('hi', handleConnect);
    gun.on('bye', handleDisconnect);

    return () => {
      gun.off('hi', handleConnect);
      gun.off('bye', handleDisconnect);
    };
  }, [setConnectionState]);

  // Gestione selezione utente
  const handleSelect = React.useCallback(async (user) => {
    try {
      setLoading(true);
      setChatInitialized(false);
      chatInitializedRef.current = false;
      
      console.log('Selecting user:', user);
      
      // Reset dello stato corrente
      setCurrentChatData(null);
      setSelected(null);
      
      // Prepara i dati della chat in base al tipo
      let chatData;
      if (user.type === 'channel' || user.type === 'group') {
        chatData = {
          roomId: user.id,
          type: user.type,
          name: user.name,
          isGroup: true,
          members: user.members
        };
      } else {
        // Per le chat private, usa sempre createChat per ottenere/creare la chat
        chatData = await new Promise((resolve, reject) => {
          messaging.createChat(user.pub, (response) => {
            console.log('Create chat response:', response);
            if (response.success && response.chat) {
              resolve(response.chat);
            } else {
              reject(new Error(response.errMessage || 'Failed to create chat'));
            }
          });
        });
      }

      console.log('Chat data prepared:', chatData);

      // Imposta l'utente/gruppo selezionato con i dati aggiornati
      const selectedData = {
        ...user,
        roomId: chatData.roomId || chatData.id,
        type: user.type || 'private',
        chat: chatData
      };

      console.log('Setting selected data:', selectedData);

      setSelected(selectedData);
      selectedRef.current = selectedData;

      // Imposta i dati della chat
      setCurrentChatData(chatData);
      setChatInitialized(true);
      chatInitializedRef.current = true;
      
      // Salva la selezione nel localStorage
      localStorage.setItem('selectedUser', JSON.stringify(selectedData));
      
    } catch (error) {
      console.error('Errore selezione:', error);
      toast.error("Errore nella selezione");
      setSelected(null);
      selectedRef.current = null;
      localStorage.removeItem('selectedUser');
    } finally {
      setLoading(false);
    }
  }, [setSelected]);

  // Effetto per mantenere la selezione
  useEffect(() => {
    const savedSelection = localStorage.getItem('selectedUser');
    if (savedSelection && !selectedRef.current) {
      try {
        const parsedSelection = JSON.parse(savedSelection);
        setSelected(parsedSelection);
        selectedRef.current = parsedSelection;
        if (parsedSelection.chat && parsedSelection.roomId) {
          setCurrentChatData(parsedSelection.chat);
          setChatInitialized(true);
          chatInitializedRef.current = true;
        }
      } catch (error) {
        console.error('Error parsing saved selection:', error);
        localStorage.removeItem('selectedUser');
      }
    }
  }, [setSelected]);

  // Effetto per gestire il cleanup
  useEffect(() => {
    return () => {
      chatInitializedRef.current = false;
    };
  }, []);

  // Monitora le richieste di amicizia e gli amici
  React.useEffect(() => {
    if (!user.is) return;

    console.log('Starting friend requests and friends monitoring');
    let mounted = true;
    let debugIntervalId = null;

    // Monitora il nodo pubblico delle richieste con throttling
    const processRequest = (request) => {
      if (!mounted || !request || !request.to || request.to !== user.is.pub) return;

      const requestId = `${request.from}-${request.timestamp}`;
      if (processedRequestsRef.current.has(requestId)) return;

      // Verifica se l'utente è già un amico
      if (friendsRef.current.has(request.from)) {
        gun.get('all_friend_requests')
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun.get('all_friend_requests').get(key).put(null);
            }
          });
        return;
      }

      processedRequestsRef.current.add(requestId);

      setPendingRequests((prev) => {
        const exists = prev.some((r) => r.pub === request.from);
        if (!exists) {
          return [
            ...prev,
            {
              pub: request.from,
              alias: request.senderInfo?.alias || request.data?.senderInfo?.alias || 'Unknown',
              timestamp: request.timestamp,
              data: request.data,
              senderInfo: request.senderInfo,
              key: request.key,
            },
          ];
        }
        return prev;
      });
    };

    let requestProcessTimeout = null;
    const unsubPublic = gun.get('all_friend_requests')
      .map()
      .on((request) => {
        // Usa il throttling per processare le richieste
        if (requestProcessTimeout) clearTimeout(requestProcessTimeout);
        requestProcessTimeout = setTimeout(() => processRequest(request), 500);
      });

    // Monitora gli amici con throttling
    let friendProcessTimeout = null;
    const processFriend = (friendship, id) => {
      if (!mounted || !friendship) return;

      if (friendship.user1 === user.is.pub || friendship.user2 === user.is.pub) {
        const friendPub = friendship.user1 === user.is.pub ? friendship.user2 : friendship.user1;
        friendsRef.current.add(friendPub);

        gun.get(`~${friendPub}`).once((userData) => {
          if (!mounted || !userData) return;
          
          setFriends(prev => {
            const exists = prev.some(f => f.pub === friendPub);
            if (!exists) {
              return [
                ...prev,
                {
                  pub: friendPub,
                  alias: userData.alias || 'Unknown',
                  friendshipId: id,
                  added: friendship.created,
                  isFriend: true,
                  type: 'friend'
                }
              ];
            }
            return prev;
          });
        });
      }
    };

    const unsubFriendships = gun.get('friendships')
      .map()
      .on((friendship, id) => {
        // Usa il throttling per processare gli amici
        if (friendProcessTimeout) clearTimeout(friendProcessTimeout);
        friendProcessTimeout = setTimeout(() => processFriend(friendship, id), 500);
      });

    // Debug info con intervallo più lungo
    if (process.env.NODE_ENV === 'development') {
      debugIntervalId = setInterval(() => {
        if (!mounted) return;
        console.log('Current pending requests:', pendingRequests);
        console.log('Processed requests:', Array.from(processedRequestsRef.current));
        console.log('Current friends:', Array.from(friendsRef.current));
      }, 30000); // Aumentato a 30 secondi
    }

    return () => {
      mounted = false;
      if (debugIntervalId) clearInterval(debugIntervalId);
      if (requestProcessTimeout) clearTimeout(requestProcessTimeout);
      if (friendProcessTimeout) clearTimeout(friendProcessTimeout);
      if (typeof unsubPublic === 'function') unsubPublic();
      if (typeof unsubFriendships === 'function') unsubFriendships();
      processedRequestsRef.current.clear();
      friendsRef.current.clear();
    };
  }, [setFriends]);

  useEffect(() => {
    const handlePreLogout = () => {
      Object.values(subscriptions.current).forEach((unsub) => {
        if (typeof unsub === 'function') {
          try {
            unsub();
          } catch (error) {
            console.warn(
              'Errore durante la pulizia della sottoscrizione:',
              error
            );
          }
        }
      });
    };

    window.addEventListener('pre-logout', handlePreLogout);

    return () => {
      window.removeEventListener('pre-logout', handlePreLogout);
      handlePreLogout();
    };
  }, []);

  // Aggiungi questa funzione per gestire la riconnessione
  const handleReconnect = () => {
    try {
      // Forza la disconnessione
      gun.off();
      // Riconnetti dopo un breve delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Errore durante la riconnessione:', error);
    }
  };

  React.useEffect(() => {
    let mounted = true;

    // Verifica la sessione
    const validateSession = async () => {
      const isValid = await authentication.sessionManager.validateSession();
      if (!isValid && mounted) {
        navigate('/login', { replace: true });
      }
    };

    // Osserva lo stato di autenticazione
    const subscription = authentication.observeAuthState().subscribe({
      next: (authState) => {
        if (!mounted) return;
        
        if (authState.success) {
          console.log('Utente autenticato:', authState.user);
          validateSession(); // Verifica la sessione quando l'utente è autenticato
        } else {
          console.log('Utente non autenticato');
          navigate('/login', { replace: true });
        }
      },
      error: (error) => {
        console.error('Errore nell\'osservazione dello stato di autenticazione:', error);
        if (mounted) {
          navigate('/login', { replace: true });
        }
      }
    });

    // Cleanup
    return () => {
      mounted = false;
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, [navigate]);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="w-full border-b border-gray-100 bg-white">
        <div className="w-full px-4">
          <div className="flex justify-between items-center h-16">
            {/* Logo e profilo allineati a sinistra */}
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-black">linda</h1>

              <Profile />
            </div>
            <AppStatus />
          </div>
        </div>
      </div>

      {/* Container principale per la chat e la sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-full md:w-[380px] flex flex-col border-r border-gray-200 bg-white">
          {/* Tab di navigazione */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveView('chats')}
              className={`flex-1 py-3 text-sm font-medium ${
                activeView === 'chats'
                  ? 'text-blue-500 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveView('groups')}
              className={`flex-1 py-3 text-sm font-medium ${
                activeView === 'groups'
                  ? 'text-blue-500 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Gruppi e Canali
            </button>
          </div>

          {/* Barra di ricerca */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <input
                type="text"
                placeholder={activeView === 'chats' ? "Cerca una chat..." : "Cerca un gruppo..."}
                className="w-full px-4 py-2 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => setIsShown(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-gray-100 rounded-full transition-colors"
                title={activeView === 'chats' ? "Aggiungi amico" : "Crea gruppo"}
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Lista chat o gruppi */}
          <div className="flex-1 overflow-y-auto">
            {activeView === 'chats' ? (
              <Friends
                onSelect={handleSelect}
                pendingRequests={pendingRequests}
                loading={loading}
                selectedUser={selectedRef.current}
              />
            ) : (
              <Groups onSelect={handleSelect} />
            )}
          </div>
        </div>

        {/* Area chat */}
        <div className="hidden md:flex flex-1 flex-col bg-gray-50">
        {console.log("SELECTED", selected)}

          {selected ? (
            <Messages 
              key={selected.roomId || selected.id} 
              chatData={currentChatData}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">
                {activeView === 'chats' 
                  ? "Seleziona un amico per chattare"
                  : "Seleziona un gruppo o canale"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal per aggiungere amici */}
      {isShown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium">Aggiungi amico</h3>
              <button
                onClick={() => setIsShown(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <AddFriend onClose={() => setIsShown(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
