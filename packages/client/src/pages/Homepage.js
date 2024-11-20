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
import { authentication, DAPP_NAME } from '../protocol';
import Channels from '../components/Homepage/Channels';

const { chat } = messaging; // Destruttura il servizio chat

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
          members: user.members,
          creator: user.creator
        };
      } else {
        // Per le chat private, usa sempre createChat per ottenere/creare la chat
        chatData = await new Promise((resolve, reject) => {
          chat.createChat(user.pub, (response) => {
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
        type: user.type || 'friend',
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

  // Definisci validateSession fuori dall'effetto delle amicizie
  const validateSession = async () => {
    try {
      // Verifichiamo solo se l'utente è presente
      if (user?.is) {
        const isValid = await authentication.sessionManager.validateSession();
        return isValid;
      }

      const walletAuth = localStorage.getItem('walletAuth');
      
      if (walletAuth) {
        const { address } = JSON.parse(walletAuth);
        const isValid = await authentication.sessionManager.validateSession();
        
        if (!isValid) {
          try {
            const result = await authentication.loginWithMetaMask(address);
            if (!result.success) {
              navigate('/login', { replace: true });
              return false;
            }
            return true;
          } catch (error) {
            console.error('Errore riautenticazione MetaMask:', error);
            navigate('/login', { replace: true });
            return false;
          }
        }
        return isValid;
      } else {
        const isValid = await authentication.sessionManager.validateSession();
        if (!isValid) {
          navigate('/login', { replace: true });
          return false;
        }
        return isValid;
      }
    } catch (error) {
      console.error('Errore validazione sessione:', error);
      navigate('/login', { replace: true });
      return false;
    }
  };

  // Effetto separato per la gestione dell'autenticazione
  React.useEffect(() => {
    let mounted = true;
    
    const subscription = authentication.observeAuthState().subscribe({
      next: async (authState) => {
        if (!mounted) return;
        
        if (authState.success) {
          console.log('Utente autenticato:', authState.user);
          
          // Aggiorna i dati utente nel gun solo se l'utente è presente
          if (user?.is) {
            gun.get(DAPP_NAME)
              .get('userList')
              .get('users')
              .set({
                pub: user?.is?.pub,
                username: user?.is?.alias,
                timestamp: Date.now(),
                lastSeen: Date.now()
              });
          }

          // Validazione sessione solo se necessario
          const isValid = await validateSession();
          console.log("isValid", isValid);
          
          if (!isValid && mounted) {
            navigate('/login', { replace: true });
          }
        } else {
          console.log('Utente non autenticato');
          navigate('/login', { replace: true });
        }
      },
      error: (error) => {
        console.error('Errore osservazione stato auth:', error);
        if (mounted) navigate('/login', { replace: true });
      }
    });

    return () => {
      mounted = false;
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, [navigate]);

  // Monitora le richieste di amicizia e gli amici
  React.useEffect(() => {
    if (!user?.is) return;

    console.log('Starting friend requests and friends monitoring');
    let mounted = true;
    const processedRequests = new Set(); // Cache per le richieste già processate

    // Monitora il nodo pubblico delle richieste
    const processRequest = async (request) => {
      if (!mounted || !request) return;

      // Verifica che la richiesta sia diretta all'utente corrente
      if (request.to !== user.is.pub) return;

      // Crea un ID univoco per la richiesta
      const requestId = `${request.from}_${request.timestamp}`;

      // Se la richiesta è già stata processata, ignorala
      if (processedRequests.has(requestId)) {
        console.log('Request already processed:', requestId);
        return;
      }

      console.log('Processing friend request:', request);
      processedRequests.add(requestId);

      // Verifica se l'utente è già un amico
      if (friendsRef.current.has(request.from)) {
        console.log('User is already a friend:', request.from);
        // Rimuovi la richiesta se esiste
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
        return;
      }

      // Aggiungi la nuova richiesta
      setPendingRequests((prev) => {
        const exists = prev.some((r) => r.pub === request.from);
        if (!exists) {
          const newRequest = {
            pub: request.from,
            alias: request.senderInfo?.alias || request.data?.senderInfo?.alias || 'Unknown',
            timestamp: request.timestamp,
            data: request.data,
            senderInfo: request.senderInfo,
            key: request.key,
          };
          console.log('New request added:', newRequest);
          return [...prev, newRequest];
        }
        return prev;
      });
    };

    // Usa un debounce per le richieste private
    let debounceTimeout;
    const processPrivateRequest = async (request) => {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      
      debounceTimeout = setTimeout(async () => {
        if (!request?.data) return;

        try {
          const senderPub = request.from;
          const senderData = await gun.get(`~${senderPub}`).then();
          if (!senderData?.epub) return;

          const sharedSecret = await SEA.secret(senderData.epub, user._.sea);
          const decrypted = await SEA.decrypt(request.data, sharedSecret);
          
          if (decrypted) {
            const parsedRequest = typeof decrypted === 'string' ? 
              JSON.parse(decrypted) : decrypted;
            processRequest(parsedRequest);
          }
        } catch (error) {
          console.error('Error processing encrypted request:', error);
        }
      }, 500); // Delay di 500ms
    };

    // Sottoscrizioni con throttling
    const unsubPublic = gun.get(DAPP_NAME)
      .get('all_friend_requests')
      .map()
      .on((request) => {
        if (request) {
          processRequest(request);
        }
      });

    const unsubPrivate = gun.get(DAPP_NAME)
      .get('friend_requests')
      .get(user.is.pub)
      .map()
      .on((request) => {
        if (request) {
          processPrivateRequest(request);
        }
      });

    // Debug info con throttling
    const debugInterval = setInterval(() => {
      if (!mounted) return;
      console.log('Debug info:');
      console.log('- Pending requests:', pendingRequests);
      console.log('- Processed requests:', Array.from(processedRequests));
      console.log('- Current friends:', Array.from(friendsRef.current));
    }, 10000); // Ogni 10 secondi invece di 5

    return () => {
      mounted = false;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (typeof unsubPublic === 'function') unsubPublic();
      if (typeof unsubPrivate === 'function') unsubPrivate();
      clearInterval(debugInterval);
      processedRequests.clear();
    };
  }, [user?.is]);

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

  // Aggiungi un effetto per il ping periodico
  React.useEffect(() => {
    const pingInterval = setInterval(() => {
      if (user?.is) {
        gun.get(DAPP_NAME)
          .get('userList')
          .get('users')
          .get(user?.is?.pub)
          .get('lastSeen')
          .put(Date.now());
      }
    }, 30000); // Ogni 30 secondi

    return () => clearInterval(pingInterval);
  }, []);

  // Aggiungi questo effetto per gestire gli errori di rete
  React.useEffect(() => {
    const handleNetworkError = () => {
      toast.error('Errore di connessione. Tentativo di riconnessione...');
      handleReconnect();
    };

    window.addEventListener('offline', handleNetworkError);
    gun.on('disconnect', handleNetworkError);

    return () => {
      window.removeEventListener('offline', handleNetworkError);
      gun.off('disconnect', handleNetworkError);
    };
  }, []);

  // Aggiungi questa cache per gli aggiornamenti
  const updateCache = {
    friends: new Map(),
    selected: null,
    lastUpdate: 0,
    THROTTLE_TIME: 2000 // 2 secondi di throttle
  };

  // Modifica l'effetto che monitora gli aggiornamenti degli utenti
  React.useEffect(() => {
    if (!user?.is) return;

    let mounted = true;
    let updateTimeout = null;

    const processUpdate = (userData) => {
      if (!mounted || !userData?.pub) return;

      const now = Date.now();
      if (now - updateCache.lastUpdate < updateCache.THROTTLE_TIME) {
        return; // Ignora aggiornamenti troppo frequenti
      }

      // Verifica se i dati sono effettivamente cambiati
      const currentData = updateCache.friends.get(userData.pub);
      const newData = JSON.stringify({
        nickname: userData.nickname,
        username: userData.username,
        avatarSeed: userData.avatarSeed
      });

      if (currentData === newData) return; // Nessun cambiamento
      updateCache.friends.set(userData.pub, newData);
      updateCache.lastUpdate = now;

      // Raggruppa gli aggiornamenti
      if (updateTimeout) clearTimeout(updateTimeout);
      
      updateTimeout = setTimeout(() => {
        // Aggiorna friends solo se necessario
        setFriends(prev => {
          const needsUpdate = prev.some(friend => {
            const cached = JSON.parse(updateCache.friends.get(friend.pub) || '{}');
            return friend.pub === userData.pub && 
                   (friend.alias !== (cached.nickname || cached.username) || 
                    friend.avatarSeed !== cached.avatarSeed);
          });

          if (!needsUpdate) return prev;

          return prev.map(friend => {
            if (friend.pub === userData.pub) {
              const cached = JSON.parse(updateCache.friends.get(friend.pub) || '{}');
              return {
                ...friend,
                alias: cached.nickname || cached.username || friend.alias,
                avatarSeed: cached.avatarSeed
              };
            }
            return friend;
          });
        });

        // Aggiorna selected solo se necessario
        setSelected(prev => {
          if (!prev || prev.pub !== userData.pub) return prev;
          
          const cached = JSON.parse(updateCache.friends.get(userData.pub) || '{}');
          const newUpdate = JSON.stringify({
            alias: cached.nickname || cached.username,
            avatarSeed: cached.avatarSeed
          });

          if (updateCache.selected === newUpdate) return prev;
          updateCache.selected = newUpdate;

          return {
            ...prev,
            alias: cached.nickname || cached.username || prev.alias,
            avatarSeed: cached.avatarSeed
          };
        });
      }, 1000);
    };

    // Una sola sottoscrizione per gli aggiornamenti degli utenti
    const unsubUserUpdates = gun.get(DAPP_NAME)
      .get('userList')
      .get('users')
      .map()
      .on((userData, key) => {
        if (userData?.pub) {
          processUpdate(userData);
        }
      });

    return () => {
      mounted = false;
      if (updateTimeout) clearTimeout(updateTimeout);
      if (typeof unsubUserUpdates === 'function') {
        unsubUserUpdates();
      }
      updateCache.friends.clear();
      updateCache.selected = null;
    };
  }, [user?.is]);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="w-full border-b border-gray-100 bg-white">
        <div className="w-full px-4">
          <div className="flex justify-between items-center h-16">
            {/* Logo e profilo allineati a sinistra */}
            <div className="flex items-center space-x-8">
              <Profile onProfileUpdate={(updatedData) => {
                // Aggiorna i dati dell'utente nel nodo pubblico
                gun.get(DAPP_NAME)
                  .get('userList')
                  .get('users')
                  .set({
                    pub: user.is.pub,
                    nickname: updatedData.nickname,
                    avatarSeed: updatedData.avatarSeed,
                    timestamp: Date.now(),
                    lastSeen: Date.now(),
                    username: user.is.alias,
                    authType: localStorage.getItem('walletAuth') ? 'wallet' : 'gun'
                  });
              }} />
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
              onClick={() => setActiveView('channels')}
              className={`flex-1 py-3 text-sm font-medium ${
                activeView === 'channels'
                  ? 'text-blue-500 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Bacheche e Canali
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

          {/* Lista chat o canali */}
          <div className="flex-1 overflow-y-auto">
            {activeView === 'chats' ? (
              <Friends 
                onSelect={handleSelect}
                pendingRequests={pendingRequests}
                loading={loading}
                selectedUser={selectedRef.current}
                setPendingRequests={setPendingRequests}
              />
            ) : (
              <Channels onSelect={handleSelect} />
            )}
          </div>
        </div>

        {/* Area chat */}
        <div className="hidden md:flex flex-1 flex-col bg-gray-50">
          {console.log("SELECTED", selected)}

          {selected ? (
            <Messages 
              key={selected.roomId || selected.id} 
              chatData={selected}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">
                {activeView === 'chats' 
                  ? "Seleziona un amico per chattare"
                  : "Seleziona una bacheca o un canale"}
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
