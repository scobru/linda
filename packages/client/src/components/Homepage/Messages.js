import React from 'react';
import Context from '../../contexts/context';
import { toast, Toaster } from 'react-hot-toast';
import { AiOutlineSend } from 'react-icons/ai';
import { messaging, blocking } from '../../protocol';
import { gun, user, notifications , DAPP_NAME } from '../../protocol';
import { userUtils } from '../../protocol/src/utils/userUtils';
import { createMessagesCertificate } from '../../protocol/src/security';

const { userBlocking } = blocking;
const { channels } = messaging;

// Custom hook per l'intersection observer
const useIntersectionObserver = (callback, deps = []) => {
  const observer = React.useRef(null);

  React.useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback(entry.target.dataset.messageId);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, deps);

  return observer.current;
};

// Custom hook for message receipts
const useMessageReceipts = (messageId, roomId) => {
  const [status, setStatus] = React.useState({ delivered: false, read: false });

  React.useEffect(() => {
    if (!messageId || !roomId) return;

    // const unsub = gun.get(`chats/${roomId}/receipts`)
    //   .get(messageId)
    //   .on((receipt) => {
    //     if (receipt) {
    //       setStatus({
    //         delivered: receipt.type === 'delivery' || receipt.type === 'read',
    //         read: receipt.type === 'read'
    //       });
    //     }
    //   });

    console.log(notifications.messageNotifications)

    const unsub = notifications.messageNotifications
      .observeReadReceipts(messageId, roomId)
      .subscribe((receipt) => {
        setStatus({
          delivered: receipt.type === 'delivery' || receipt.type === 'read',
          read: receipt.type === 'read',
        });
      });

    // Initial state check
    gun
      .get(`chats/${roomId}/receipts`)
      .get(messageId)
      .once((receipt) => {
        if (receipt) {
          setStatus({
            delivered: receipt.type === 'delivery' || receipt.type === 'read',
            read: receipt.type === 'read',
          });
        }
      });

    return () => {
      if (typeof unsub === 'function') {
        try {
          unsub();
        } catch (error) {
          console.warn('Error unsubscribing from receipts:', error);
        }
      }
    };
  }, [messageId, roomId]);

  return {
    status,
    setStatus,
    initMessageTracking: async () => {
      if (!user.is) return;
      await gun.get(`chats/${roomId}/receipts`).get(messageId).put({
        type: 'sent',
        timestamp: Date.now(),
        by: user.is.pub,
      });
    },
  };
};

// Custom hook for sending receipts
const useSendReceipt = () => {
  const sendReceipt = React.useCallback(async (messageId, roomId, type) => {
    if (!user.is || !messageId || !roomId) return;

    try {
      await gun.get(`chats/${roomId}/receipts`).get(messageId).put({
        type,
        timestamp: Date.now(),
        by: user.is.pub,
      });
    } catch (error) {
      console.warn(`Error sending ${type} receipt:`, error);
    }
  }, []);

  return {
    sendDeliveryReceipt: (messageId, roomId) =>
      sendReceipt(messageId, roomId, 'delivery'),
    sendReadReceipt: (messageId, roomId) =>
      sendReceipt(messageId, roomId, 'read'),
  };
};

// Single MessageStatus component combining both functionalities
const MessageStatus = ({ message }) => {
  const { selected } = React.useContext(Context);
  const { status } = useMessageReceipts(message.id, selected?.roomId);
  const { sendDeliveryReceipt, sendReadReceipt } = useSendReceipt();

  React.useEffect(() => {
    if (message && message.sender !== user.is.pub && !status.read) {
      sendDeliveryReceipt(message.id, selected?.roomId);
      sendReadReceipt(message.id, selected?.roomId);
    }
  }, [
    message,
    status.read,
    selected?.roomId,
    sendDeliveryReceipt,
    sendReadReceipt,
  ]);

  return (
    <span className="text-xs ml-1 flex">
      {!status.delivered && <span className="text-gray-400">✓</span>}
      {status.delivered && !status.read && (
        <span className="text-gray-400">✓✓</span>
      )}
      {status.read && <span className="text-blue-500">✓✓</span>}
    </span>
  );
};

// New hook to handle message visibility and receipts
const useMessageVisibility = (messages, setMessages, selected) => {
  const { sendDeliveryReceipt, sendReadReceipt } = useSendReceipt();

  const handleMessageVisible = React.useCallback(
    async (messageId) => {
      if (!selected?.pub || !selected?.roomId) return;

      // Trova il messaggio
      const message = messages.find((m) => m.id === messageId);

      // Invia notifica di lettura solo se il messaggio non è nostro e non è già stato segnato come letto
      if (message && message.sender !== user.is.pub && !message.read) {
        try {
          await sendDeliveryReceipt(messageId, selected.roomId);
          await sendReadReceipt(messageId, selected.roomId);

          // Aggiorna lo stato del messaggio localmente
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, delivered: true, read: true }
                : msg
            )
          );
        } catch (error) {
          console.warn('Error sending read receipt:', error);
        }
      }
    },
    [
      selected?.pub,
      selected?.roomId,
      messages,
      setMessages,
      sendDeliveryReceipt,
      sendReadReceipt,
    ]
  );

  return handleMessageVisible;
};

// Add this custom hook for message tracking
const useMessageTracking = () => {
  const initMessageTracking = React.useCallback(async (messageId, roomId) => {
    if (!user.is) return;

    await gun.get('chats').get(roomId).get('receipts').get(messageId).put({
      type: 'sent',
      timestamp: Date.now(),
      by: user.is.pub,
    });
  }, []);

  return { initMessageTracking };
};

// Aggiungi questa funzione per ottenere lo username
const getUserUsername = async (userPub) => {
  return new Promise((resolve) => {
    gun.get(DAPP_NAME)
      .get('userList')
      .get('nicknames')
      .get(userPub)
      .once((nickname) => {
        resolve(nickname);
      });
    // Timeout dopo 2 secondi, usa l'alias come fallback
    setTimeout(() => resolve(null), 2000);
  });
};

// Modifica il componente MessageItem per gestire meglio il layout e le scritte tagliate
const MessageItem = ({ 
  message, 
  isOwnMessage, 
  showSender, 
  user, 
  messageObserver,
  handleDeleteMessage,
  selected
}) => {
  const [senderName, setSenderName] = React.useState('');
  const { selected: selectedContext } = React.useContext(Context);
  const isCreator = selectedContext?.creator === user.is.pub;
  
  const shouldShowSender = selected?.type === 'board' || selected?.type === 'channel' || showSender;

  React.useEffect(() => {
    if (shouldShowSender && !isOwnMessage) {
      getUserUsername(message.sender).then(username => {
        if (username) {
          setSenderName(username);
        }
      });
    }
  }, [message.sender, shouldShowSender, isOwnMessage]);

  return (
    <div
      ref={(el) => {
        if (el && messageObserver) {
          el.dataset.messageId = message.id;
          messageObserver.observe(el);
        }
      }}
      className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} mb-4 max-w-[85%] ${isOwnMessage ? 'ml-auto' : 'mr-auto'}`}
    >
      {/* Header del messaggio con mittente e timestamp */}
      {shouldShowSender && (
        <div className="flex items-center mb-1">
          <div className="w-8 h-8 rounded-full flex-shrink-0">
            <img
              className="w-full h-full rounded-full"
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${senderName}&backgroundColor=b6e3f4`}
              alt=""
            />
          </div>
          <div className="ml-2 flex flex-col">
            <span className="text-sm text-gray-600 font-medium break-words">
              {isOwnMessage ? 'Tu' : senderName}
            </span>
            <span className="text-xs text-gray-400">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        </div>
      )}

      {/* Contenuto del messaggio */}
      <div className="flex items-end w-full">
        <div
          className={`rounded-lg px-4 py-2 break-words ${
            isOwnMessage
              ? 'bg-blue-500 text-white rounded-br-none ml-auto'
              : 'bg-gray-200 rounded-bl-none'
          } max-w-full`}
        >
          <span className="whitespace-pre-wrap">
            {typeof message.content === 'string'
              ? message.content
              : '[Messaggio non valido]'}
          </span>
        </div>
        {isOwnMessage && <MessageStatus message={message} />}
      </div>

      {/* Pulsante elimina */}
      {isCreator && selected?.type === 'board' && (
        <button
          onClick={() => handleDeleteMessage(message.id)}
          className="text-red-500 text-xs hover:text-red-700 mt-1 "
        >
          Elimina
        </button>
      )}
    </div>
  );
};

// Aggiungi queste funzioni di gestione dei messaggi
const handleMessages = (data) => {
  if (!isSubscribed) return;
  console.log('Received message data:', data);

  if (data.initial) {
    const validMessages = (data.initial || []).filter(
      (msg) => msg && msg.content && msg.sender && msg.timestamp
    );
    console.log('Setting initial messages:', validMessages);
    setMessages(validMessages);
    setLoading(false);
  } else if (data.individual || data.message) {
    const messageData = data.individual || data.message;
    console.log('Received new message:', messageData);
    if (messageData && messageData.content) {
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === messageData.id);
        if (!exists) {
          console.log('Adding new message to list');
          const newMessages = [...prev, messageData];
          return newMessages.sort((a, b) => a.timestamp - b.timestamp);
        }
        return prev;
      });
    }
  }
};

const handleError = (error) => {
  if (!isSubscribed) return;
  console.error('Error loading messages:', error);
  setError('Errore nel caricamento dei messaggi');
  setLoading(false);
};

export default function Messages({ chatData }) {
  const { selected, setCurrentChat, setSelected } = React.useContext(Context);
  const [messages, setMessages] = React.useState([]);
  const [newMessage, setNewMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const messagesEndRef = React.useRef(null);
  const messageSubscriptionRef = React.useRef(null);
  const toastIdRef = React.useRef(null);
  const [isBlocked, setIsBlocked] = React.useState(false);
  const [canSendMessages, setCanSendMessages] = React.useState(true);
  const [showChatMenu, setShowChatMenu] = React.useState(false);
  const [blockStatus, setBlockStatus] = React.useState({
    blockedByMe: false,
    blockedByOther: false,
  });
  const blockCheckTimeoutRef = React.useRef(null);
  const lastBlockCheckRef = React.useRef(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [canPost, setCanPost] = React.useState(false);
  const [isInitializing, setIsInitializing] = React.useState(true);
  const [isSubscribing, setIsSubscribing] = React.useState(false);
  const previousRoomIdRef = React.useRef(null);
  const [isSubscribed, setIsSubscribed] = React.useState(true);
  const [shouldScrollToBottom, setShouldScrollToBottom] = React.useState(true);
  const lastMessageRef = React.useRef(null);
  const [displayName, setDisplayName] = React.useState('');

  const { initMessageTracking } = useMessageTracking();

  // Use the new hook
  const handleMessageVisible = useMessageVisibility(
    messages,
    setMessages,
    selected
  );

  // Use the intersection observer with the handler from our hook
  const messageObserver = useIntersectionObserver(handleMessageVisible, [
    selected?.pub,
    chatData?.roomId,
  ]);

  // Reset quando cambia l'utente selezionato
  React.useEffect(() => {
    const cleanup = () => {
      if (messageSubscriptionRef.current) {
        try {
          if (typeof messageSubscriptionRef.current === 'function') {
            messageSubscriptionRef.current();
          } else if (messageSubscriptionRef.current.unsubscribe) {
            messageSubscriptionRef.current.unsubscribe();
          }
          messageSubscriptionRef.current = null;
        } catch (error) {
          console.warn('Error during messages cleanup:', error);
        }
      }
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    };

    cleanup();
    setMessages([]);
    setCurrentChat(null);
    setError(null);
    setLoading(false);

    return cleanup;
  }, [selected?.pub, setCurrentChat]);

  // Funzione per pulire la chat
  const handleClearChat = async () => {
    if (!selected?.pub || !chatData?.roomId) return;

    if (
      window.confirm(
        'Sei sicuro di voler eliminare tutti i messaggi? Questa azione non può essere annullata.'
      )
    ) {
      try {
        // Rimuovi tutti i messaggi manualmente
        gun
          .get('chats')
          .get(chatData.roomId)
          .get('messages')
          .map()
          .once((msg, key) => {
            if (msg) {
              gun
                .get('chats')
                .get(chatData.roomId)
                .get('messages')
                .get(key)
                .put(null);
            }
          });

        setMessages([]);
        toast.success('Chat pulita con successo');
      } catch (error) {
        console.error('Error clearing chat:', error);
        toast.error('Errore durante la pulizia della chat');
      }
    }
  };

  // Funzione per verificare lo stato di blocco con throttling
  const checkBlockStatus = React.useCallback(async (userPub) => {
    // Evita controlli troppo frequenti (minimo 2 secondi tra un controllo e l'altro)
    const now = Date.now();
    if (lastBlockCheckRef.current && now - lastBlockCheckRef.current < 2000) {
      return;
    }

    lastBlockCheckRef.current = now;

    try {
      // Usa i metodi del servizio blocking
      const blockedByMe = await userBlocking.isBlocked(userPub);
      const blockedByOther = await userBlocking.isBlockedBy(userPub);

      console.log('Block status:', { blockedByMe, blockedByOther }); // Debug log

      // Aggiorna lo stato solo se è cambiato
      setBlockStatus((prev) => {
        if (
          prev.blockedByMe !== blockedByMe ||
          prev.blockedByOther !== blockedByOther
        ) {
          return { blockedByMe, blockedByOther };
        }
        return prev;
      });

      setIsBlocked(blockedByMe);
      setCanSendMessages(!blockedByMe && !blockedByOther);

      if (blockedByMe) {
        setError('blocked_by_me');
      } else if (blockedByOther) {
        setError('blocked_by_other');
      } else {
        setError(null);
      }
    } catch (error) {
      console.error('Error checking block status:', error);
    }
  }, []);

  // Funzione per sbloccare un utente
  const handleUnblock = async () => {
    if (!selected?.pub) return;

    try {
      await userBlocking.unblockUser(selected.pub);
      setIsBlocked(false);
      setCanSendMessages(true);
      setError(null);
      toast.success(`${selected.alias} è stato sbloccato`);
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast.error("Errore durante lo sblocco dell'utente");
    }
  };

  // Aggiungi una funzione per bloccare l'utente
  const handleBlock = async () => {
    if (!selected?.pub) return;

    try {
      await userBlocking.blockUser(selected.pub);
      setIsBlocked(true);
      setCanSendMessages(false);
      toast.success(`${selected.alias} è stato bloccato`);
    } catch (error) {
      console.error('Error blocking user:', error);
      toast.error("Errore durante il blocco dell'utente");
    }
  };

  // Aggiungi stato per i permessi
  const [canWrite, setCanWrite] = React.useState(false);

  // Effetto per verificare i permessi
  React.useEffect(() => {
    if (!chatData || !user?.is) return;

    const checkPermissions = async () => {
      try {
        // Se è una chat privata
        if (!chatData.type || chatData.type === 'friend') {
          // Verifica se esiste un certificato per i messaggi
          const messageCert = await gun.get(DAPP_NAME)
            .get('certificates')
            .get(chatData.user1 === user.is.pub ? chatData.user2 : chatData.user1)
            .get('messages')
            .then();

          if (!messageCert) {
            // Se non esiste il certificato, crealo
            const otherPub = chatData.user1 === user.is.pub ? chatData.user2 : chatData.user1;
            const cert = await createMessagesCertificate(otherPub);
            if (cert) {
              setCanWrite(true);
            }
          } else {
            setCanWrite(true);
          }
        } 
        // Se è un canale o una bacheca
        else if (chatData.type === 'channel' || chatData.type === 'board') {
          // Se è il creatore, può sempre scrivere
          if (chatData.creator === user?.is?.pub) {
            setCanWrite(true);
            return;
          }

          // Se è un canale, solo il creatore può scrivere
          if (chatData.type === 'channel') {
            setCanWrite(chatData.creator === user.is.pub);
            return;
          }

          // Se è una bacheca, tutti i membri possono scrivere
          if (chatData.type === 'board') {
            setCanWrite(true);
          }
        }
      } catch (error) {
        console.error('Errore verifica permessi:', error);
        setCanWrite(false);
      }
    };

    checkPermissions();
  }, [chatData, user?.is]);

  // Modifica la funzione di invio messaggi
  const sendMessage = async () => {
    if (!canWrite || (!selected?.roomId && !selected?.id) || !newMessage.trim()) return;

    const messageContent = newMessage.trim();
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const messageData = {
      id: messageId,
      content: messageContent,
      sender: user.is.pub,
      senderAlias: user.is.alias || 'Unknown',
      timestamp: Date.now()
    };

    setNewMessage('');

    try {
      // Determina il percorso corretto
      let path;
      let id;

      if (selected.type === 'friend') {
        path = 'chats';
        id = selected.roomId;
      } else if (selected.type === 'channel') {
        path = 'channels';
        id = selected.id;
      } else if (selected.type === 'board') {
        path = 'boards';
        id = selected.id;
      }

      console.log('Saving message to:', { path, id, type: selected.type });

      // Salva il messaggio
      await gun.get(DAPP_NAME)
        .get(path)
        .get(id)
        .get('messages')
        .get(messageId)
        .put(messageData);

      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(error.message || "Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  };

  // Aggiungi anche un handler per l'invio con il tasto Enter
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('Enter key pressed, attempting to send message');
      sendMessage();
    }
  };

  // Modifica l'effetto che monitora lo stato di blocco
  React.useEffect(() => {
    if (!selected?.pub) return;

    let isSubscribed = true;

    // Verifica iniziale dello stato di blocco
    checkBlockStatus(selected.pub);

    // Monitora i cambiamenti dello stato di blocco per entrambi gli utenti
    const unsubMyBlocks = gun
      .user()
      .get('blocked_users')
      .map()
      .on(() => {
        if (!isSubscribed) return;

        // Usa il throttling per le verifiche di stato
        if (blockCheckTimeoutRef.current) {
          clearTimeout(blockCheckTimeoutRef.current);
        }

        blockCheckTimeoutRef.current = setTimeout(() => {
          checkBlockStatus(selected.pub);
        }, 1000);
      });

    const unsubOtherBlocks = gun
      .get(`~${selected.pub}`)
      .get('blocked_users')
      .map()
      .on(() => {
        if (!isSubscribed) return;

        // Usa il throttling per le verifiche di stato
        if (blockCheckTimeoutRef.current) {
          clearTimeout(blockCheckTimeoutRef.current);
        }

        blockCheckTimeoutRef.current = setTimeout(() => {
          checkBlockStatus(selected.pub);
        }, 1000);
      });

    return () => {
      isSubscribed = false;
      if (typeof unsubMyBlocks === 'function') unsubMyBlocks();
      if (typeof unsubOtherBlocks === 'function') unsubOtherBlocks();
      if (blockCheckTimeoutRef.current) {
        clearTimeout(blockCheckTimeoutRef.current);
      }
    };
  }, [selected?.pub, checkBlockStatus]);

  // Modifica l'effetto principale che gestisce il setup della chat
  React.useEffect(() => {
    if (!selected?.roomId && !selected?.id) return;

    setIsSubscribed(true);
    setLoading(true);
    console.log('Setting up chat for:', selected);

    const setupChat = async () => {
      try {
        // Pulisci le sottoscrizioni precedenti
        if (messageSubscriptionRef.current) {
          if (typeof messageSubscriptionRef.current === 'function') {
            messageSubscriptionRef.current();
          }
          messageSubscriptionRef.current = null;
        }

        // Resetta i messaggi
        setMessages([]);

        // Determina il percorso corretto in base al tipo
        let path;
        let id;

        if (selected.type === 'friend') {
          path = 'chats';
          id = selected.roomId;
        } else if (selected.type === 'channel') {
          path = 'channels';
          id = selected.id;
        } else if (selected.type === 'board') {
          path = 'boards';
          id = selected.id;
        }

        console.log('Loading messages from:', { path, id, type: selected.type });

        // Carica i messaggi esistenti
        const existingMessages = await new Promise((resolve) => {
          const messages = [];
          gun.get(DAPP_NAME)
            .get(path)
            .get(id)
            .get('messages')
            .map()
            .once((msg, msgId) => {
              if (msg && msg.content) {
                messages.push({ ...msg, id: msgId });
              }
            });
          
          setTimeout(() => resolve(messages), 500);
        });

        if (!isSubscribed) return;

        // Imposta i messaggi iniziali
        if (existingMessages.length > 0) {
          setMessages(existingMessages.sort((a, b) => a.timestamp - b.timestamp));
        }

        // Sottoscrivi ai nuovi messaggi
        const messageHandler = gun.get(DAPP_NAME)
          .get(path)
          .get(id)
          .get('messages')
          .map()
          .on((msg, msgId) => {
            if (!isSubscribed) return;
            if (!msg || !msg.content) return;

            setMessages(prev => {
              const exists = prev.some(m => m.id === msgId);
              if (!exists) {
                const newMessages = [...prev, { ...msg, id: msgId }];
                return newMessages.sort((a, b) => a.timestamp - b.timestamp);
              }
              return prev;
            });
          });

        messageSubscriptionRef.current = messageHandler;

        // Imposta gli stati finali
        setIsInitializing(false);
        setIsSubscribing(false);
        setLoading(false);
        setError(null);

      } catch (error) {
        console.error('Error setting up chat:', error);
        if (isSubscribed) {
          setError('Errore nel caricamento della chat');
          setLoading(false);
          setIsSubscribing(false);
        }
      }
    };

    setupChat();

    return () => {
      setIsSubscribed(false);
      if (messageSubscriptionRef.current) {
        if (typeof messageSubscriptionRef.current === 'function') {
          messageSubscriptionRef.current();
        }
        messageSubscriptionRef.current = null;
      }
    };
  }, [selected]);

  // Aggiungi un effetto separato per mantenere la chat corrente
  React.useEffect(() => {
    if (chatData) {
      console.log('Current chat updated:', chatData);
    }
  }, [chatData]);

  // Aggiungi un effetto per resettare la chat quando l'amico viene rimosso
  React.useEffect(() => {
    if (!selected?.pub) return;

    const unsubFriendRemoval = gun
      .get('friendships')
      .map()
      .on(() => {
        // Verifica se l'amicizia esiste ancora
        let friendshipExists = false;
        gun
          .get('friendships')
          .map()
          .once((data) => {
            if (
              data &&
              ((data.user1 === selected.pub && data.user2 === user.is.pub) ||
                (data.user2 === selected.pub && data.user1 === user.is.pub))
            ) {
              friendshipExists = true;
            }
          });

        // Se l'amicizia non esiste più, resetta la vista
        if (!friendshipExists) {
          setCurrentChat(null);
          setMessages([]);
          setError(null);
        }
      });

    return () => {
      if (typeof unsubFriendRemoval === 'function') unsubFriendRemoval();
    };
  }, [selected?.pub, setCurrentChat]);

  // Modifica l'effetto che monitora le ricevute
  React.useEffect(() => {
    if (!selected?.roomId) return;
    const subscriptions = new Map(); // Usa una Map per tenere traccia delle sottoscrizioni

    // Funzione per sottoscriversi a un singolo messaggio
    const subscribeToMessage = (message) => {
      if (message.sender !== user.is.pub || subscriptions.has(message.id))
        return;

      const unsubscribe = gun
        .get(DAPP_NAME)
        .get(`chats/${selected.roomId}/receipts`)
        .get(message.id)
        .on((receipt) => {
          if (!receipt) return;

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === receipt.messageId) {
                return {
                  ...msg,
                  delivered: receipt.type === 'delivery' || msg.delivered,
                  read: receipt.type === 'read' || msg.read,
                };
              }
              return msg;
            })
          );
        });

      if (typeof unsubscribe === 'function') {
        subscriptions.set(message.id, unsubscribe);
      }
    };

    // Sottoscrivi ai messaggi esistenti
    messages.forEach(subscribeToMessage);

    return () => {
      // Pulisci tutte le sottoscrizioni
      subscriptions.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
      subscriptions.clear();
    };
  }, [selected?.roomId]); // Rimuovi messages dalle dipendenze

  // Aggiungi un effetto separato per gestire i nuovi messaggi
  React.useEffect(() => {
    if (!selected?.roomId || !messages.length) return;

    // Trova l'ultimo messaggio
    const lastMessage = messages[messages.length - 1];

    // Se è un nostro messaggio, sottoscrivi alle sue ricevute
    if (lastMessage && lastMessage.sender === user.is.pub) {
      const unsubscribe = gun
        .get(DAPP_NAME)
        .get(`chats/${selected.roomId}/receipts`)
        .get(lastMessage.id)
        .on((receipt) => {
          if (!receipt) return;

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === receipt.messageId) {
                return {
                  ...msg,
                  delivered: receipt.type === 'delivery' || msg.delivered,
                  read: receipt.type === 'read' || msg.read,
                };
              }
              return msg;
            })
          );
        });

      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [selected?.roomId, messages.length]); // Usa messages.length invece di messages

  // Modifica la funzione handleDeleteMessage
  const handleDeleteMessage = async (messageId) => {
    if (!selected?.roomId || !selected?.creator || selected.creator !== user.is.pub) {
      return;
    }

    try {
      // Determina il percorso corretto
      let path;
      let id;

      if (selected.type === 'friend') {
        path = 'chats';
        id = selected.roomId;
      } else if (selected.type === 'channel') {
        path = 'channels';
        id = selected.id;
      } else if (selected.type === 'board') {
        path = 'boards';
        id = selected.id;
      }

      console.log('Deleting message from:', { path, id, messageId });

      // Rimuovi il messaggio usando una Promise per assicurarsi che l'operazione sia completata
      await new Promise((resolve, reject) => {
        gun.get(DAPP_NAME)
          .get(path)
          .get(id)
          .get('messages')
          .get(messageId)
          .put(null, (ack) => {
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve();
            }
          });
      });

      // Se è una bacheca, rimuovi anche dal nodo pubblico
      if (selected.type === 'board') {
        await new Promise((resolve, reject) => {
          gun.get(DAPP_NAME)
            .get('public_boards')
            .get(id)
            .get('messages')
            .get(messageId)
            .put(null, (ack) => {
              if (ack.err) {
                reject(new Error(ack.err));
              } else {
                resolve();
              }
            });
        });
      }
      
      // Aggiorna la lista dei messaggi localmente
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      
      toast.success('Messaggio rimosso');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Errore nella rimozione del messaggio');
    }
  };

  // Aggiungi questa funzione per gestire lo scroll
  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesEndRef.current && shouldScrollToBottom) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  // Aggiungi questo effetto per gestire lo scroll automatico
  React.useEffect(() => {
    if (messages.length > 0) {
      // Salva l'ultimo messaggio come riferimento
      lastMessageRef.current = messages[messages.length - 1];
      
      // Scroll immediato al primo caricamento
      if (messages.length === 1) {
        scrollToBottom('auto');
      } else {
        scrollToBottom();
      }
    }
  }, [messages]);

  // Aggiungi questo effetto per resettare lo scroll quando cambia la chat
  React.useEffect(() => {
    setShouldScrollToBottom(true);
    if (messagesEndRef.current) {
      scrollToBottom('auto');
    }
  }, [selected?.roomId]);

  // Aggiungi questo handler per il controllo dello scroll
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldScrollToBottom(isNearBottom);
  };

  // Funzione per ottenere il nome visualizzato
  const getDisplayName = async (pubKey) => {
    // Se è l'utente corrente
    if (pubKey === user?.is?.pub) {
      // Se è un wallet
      const walletAuth = localStorage.getItem('walletAuth');
      if (walletAuth) {
        try {
          const { address } = JSON.parse(walletAuth);
          return `${address.slice(0, 6)}...${address.slice(-4)}`;
        } catch (error) {
          console.error('Errore nel parsing del wallet auth:', error);
        }
      }
      // Se è un account Gun
      if (user?.is?.alias) {
        return user.is.alias.split('.')[0];
      }
    }

    // Per altri utenti
    try {
      const userData = await new Promise((resolve) => {
        gun.get(`~${pubKey}`).once((data) => {
          resolve(data);
        });
      });

      if (userData?.alias) {
        return userData.alias.split('.')[0];
      }
    } catch (error) {
      console.error('Errore nel recupero username:', error);
    }

    // Fallback alla versione abbreviata della chiave pubblica
    return `${pubKey.slice(0, 6)}...${pubKey.slice(-4)}`;
  };

  React.useEffect(() => {
    if (chatData) {
      const otherPub = chatData.user1 === user?.is?.pub ? chatData.user2 : chatData.user1;
      
      // Sottoscrizione al nickname dell'altro utente
      const unsub = gun.get(DAPP_NAME)
        .get('userList')
        .get('nicknames')
        .get(otherPub)
        .on((nickname) => {
          if (nickname) {
            setDisplayName(nickname);
          } else {
            // Fallback all'indirizzo abbreviato
            setDisplayName(`${otherPub.slice(0, 6)}...${otherPub.slice(-4)}`);
          }
        });

      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, [chatData]);

  React.useEffect(() => {
    if (selected?.pub) {
      // Sottoscrizione agli aggiornamenti del profilo utente
      const unsubUserProfile = gun.get(DAPP_NAME)
        .get('userList')
        .get('users')
        .map()
        .on((userData) => {
          if (userData?.pub === selected.pub) {
            setDisplayName(userData.nickname || userData.username || selected.alias);
          }
        });

      return () => {
        if (typeof unsubUserProfile === 'function') {
          unsubUserProfile();
        }
      };
    }
  }, [selected?.pub]);

  if (!selected?.pub) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Seleziona un amico per chattare</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header della chat - aggiunto padding orizzontale per allinearlo */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            {selected.type === 'channel' ? '📢' : selected.type === 'board' ? '📋' : (
              <img
                className="w-full h-full rounded-full"
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selected.avatarSeed || displayName}&backgroundColor=b6e3f4`}
                alt=""
              />
            )}
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">
              {selected.type === 'channel' || selected.type === 'board' 
                ? selected.name 
                : (displayName || selected.alias || 'Utente')}
            </p>
            <p className="text-xs text-gray-500">
              {selected.type === 'channel' 
                ? 'Canale' 
                : selected.type === 'board' 
                  ? 'Bacheca' 
                  : selected.pub.slice(0, 8) + '...'}
            </p>
          </div>
        </div>
      </div>

      {/* Area messaggi */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        {isInitializing || isSubscribing ? (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-500">Caricamento chat...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Nessun messaggio</p>
          </div>
        ) : (
          messages
            .filter((message) => message && message.content)
            .map((message) => {
              const isOwnMessage = message.sender === user.is.pub;
              
              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isOwnMessage={isOwnMessage}
                  showSender={true} // Sempre true per le board
                  user={user}
                  messageObserver={messageObserver}
                  handleDeleteMessage={handleDeleteMessage}
                  selected={selected} // Passa selected come prop
                />
              );
            })
        )}
        <div ref={messagesEndRef} style={{ height: 1 }} />
      </div>

      {/* Input area */}
      {canWrite ? (
        <div className="border-t p-4 bg-white">
          <div className="flex items-center">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Scrivi un messaggio..."
              className="flex-1 rounded-full px-4 py-2 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className={`ml-2 p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors ${
                !newMessage.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <AiOutlineSend size={20} />
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t p-4 bg-white text-center text-gray-500">
          Non hai i permessi per scrivere qui
        </div>
      )}
      <Toaster />
    </div>
  );
}
