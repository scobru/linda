import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import Context from '../../contexts/context';
import { toast, Toaster } from 'react-hot-toast';
import { AiOutlineSend } from 'react-icons/ai';
import { messaging, blocking } from '../../protocol';
import { gun, user, notifications , DAPP_NAME } from '../../protocol';
import { userUtils } from '../../protocol/src/utils/userUtils';
import { createMessagesCertificate } from '../../protocol/src/security';
import { walletService } from '../../protocol/src/wallet';
import { JsonRpcProvider, formatEther } from 'ethers';

const { userBlocking } = blocking;
const { channels } = messaging;
const { chat } = messaging;

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

// Modifica createMessageTracking per includere tutti i metodi necessari
const createMessageTracking = () => ({
  initMessageTracking: async (messageId, roomId) => {
    if (!user.is) return;
    await gun.get('chats').get(roomId).get('receipts').get(messageId).put({
      type: 'sent',
      timestamp: Date.now(),
      by: user.is.pub,
    });
  },

  updateMessageStatus: async (messageId, roomId, status) => {
    if (!user.is || !messageId || !roomId) return;
    try {
      await gun.get('chats').get(roomId).get('receipts').get(messageId).put({
        type: status,
        timestamp: Date.now(),
        by: user.is.pub,
      });
    } catch (error) {
      console.warn(`Error updating message status to ${status}:`, error);
    }
  },

  observeMessageStatus: (messageId, roomId) => {
    return new Observable(subscriber => {
      if (!messageId || !roomId) {
        subscriber.complete();
        return;
      }

      const handler = gun.get('chats').get(roomId).get('receipts').get(messageId).on((receipt) => {
        if (receipt) {
          subscriber.next({
            delivered: receipt.type === 'delivery' || receipt.type === 'read',
            read: receipt.type === 'read',
            timestamp: receipt.timestamp,
            by: receipt.by
          });
        }
      });

      return () => {
        if (typeof handler === 'function') {
          handler();
        }
      };
    });
  },

  observeReadReceipts: (messageId, roomId) => {
    return new Observable(subscriber => {
      if (!messageId || !roomId) {
        subscriber.complete();
        return;
      }

      const handler = gun.get('chats').get(roomId).get('receipts').get(messageId).on((receipt) => {
        if (receipt && receipt.type === 'read') {
          subscriber.next(receipt);
        }
      });

      return () => {
        if (typeof handler === 'function') {
          handler();
        }
      };
    });
  }
});

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
  
  if (data.initial) {
    const validMessages = (data.initial || []).filter(
      (msg) => msg && msg.content && msg.sender && msg.timestamp
    );
    
    const processedMessages = selected.type === 'friend' 
      ? validMessages.map(msg => messageList.decryptMessage(msg, msg.sender))
      : validMessages;
      
    Promise.all(processedMessages).then(decryptedMessages => {
      setMessages(decryptedMessages);
      setLoading(false);
    });
  }
};

const handleError = (error) => {
  if (!isSubscribed) return;
  console.error('Error loading messages:', error);
  setError('Errore nel caricamento dei messaggi');
  setLoading(false);
};

// Modifica il WalletModal per includere le informazioni del wallet
const WalletModal = ({ isOpen, onClose, onSend, selectedUser }) => {
  const [amount, setAmount] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [sendType, setSendType] = useState('contact');
  const [isLoading, setIsLoading] = useState(false);
  const [myWalletInfo, setMyWalletInfo] = useState(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [recipientWalletInfo, setRecipientWalletInfo] = useState(null);
  const [balance, setBalance] = useState(null);
  const [network, setNetwork] = useState(null);

  // Carica le informazioni dei wallet all'apertura del modale
  React.useEffect(() => {
    const loadWalletInfo = async () => {
      try {
        // Carica il wallet dell'utente corrente
        const wallet = await walletService.getCurrentWallet();
        console.log('Loaded wallet info:', wallet);
        setMyWalletInfo(wallet);

        // Carica il balance
        const provider = new JsonRpcProvider("https://sepolia.optimism.io");
        const balance = await provider.getBalance(wallet.address);
        setBalance(formatEther(balance));

        // Imposta la rete
        setNetwork({
          name: 'Optimism Sepolia',
          chainId: 11155420
        });

        // Carica il wallet del destinatario se in modalità contatto
        if (selectedUser?.pub) {
          const recipientAddress = await walletService.getUserWalletAddress(selectedUser.pub);
          console.log('Loaded recipient wallet:', recipientAddress);
          setRecipientWalletInfo({ address: recipientAddress });
        }
      } catch (error) {
        console.error('Error loading wallet info:', error);
        toast.error('Errore nel caricamento delle informazioni del wallet');
      }
    };

    if (isOpen) {
      loadWalletInfo();
    }
  }, [isOpen, selectedUser?.pub]);

  const handleCopyAddress = () => {
    if (myWalletInfo?.address) {
      navigator.clipboard.writeText(myWalletInfo.address);
      toast.success('Indirizzo copiato negli appunti!');
    }
  };

  const handleCopyPrivateKey = () => {
    if (myWalletInfo?.privateKey) {
      navigator.clipboard.writeText(myWalletInfo.privateKey);
      toast.success('Chiave privata copiata negli appunti!');
    }
  };

  const handleSend = async () => {
    try {
      setIsLoading(true);
      
      if (sendType === 'contact') {
        // Invia al contatto selezionato
        await onSend(selectedUser.pub, amount);
      } else {
        // Invia all'indirizzo custom
        await walletService.sendTransaction(customAddress, amount);
      }

      toast.success('Transazione inviata con successo!');
      onClose();
      setAmount('');
      setCustomAddress('');
    } catch (error) {
      console.error('Error sending transaction:', error);
      toast.error(error.message || 'Errore durante l\'invio');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Wallet</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Il mio wallet */}
        {myWalletInfo ? (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg break-all">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Il mio wallet</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Indirizzo:</span>
                <div className="flex items-center">
                  <span className="text-xs font-mono mr-2">
                    {myWalletInfo.address ? 
                      `${myWalletInfo.address.slice(0, 6)}...${myWalletInfo.address.slice(-4)}` :
                      'Caricamento...'
                    }
                  </span>
                  <button
                    onClick={handleCopyAddress}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="Copia indirizzo"
                    disabled={!myWalletInfo.address}
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Balance */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Balance:</span>
                <span className="text-xs font-medium">
                  {balance ? `${Number(balance).toFixed(8)} ETH` : 'Caricamento...'}
                </span>
              </div>

              {/* Network */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Rete:</span>
                <span className="text-xs font-medium">
                  {network ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {network.name}
                    </span>
                  ) : 'Caricamento...'}
                </span>
              </div>

              {/* Chiave privata (solo per wallet derivati) */}
              {myWalletInfo.type === 'derived' && myWalletInfo.privateKey && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="text-xs text-blue-500 hover:text-blue-600"
                  >
                    {showPrivateKey ? 'Nascondi' : 'Mostra'} chiave privata
                  </button>
                  {showPrivateKey && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs font-mono truncate max-w-[180px]">
                        {myWalletInfo.privateKey}
                      </span>
                      <button
                        onClick={handleCopyPrivateKey}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Copia chiave privata"
                      >
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="text-xs text-gray-500">
                Tipo: {myWalletInfo.type === 'metamask' ? 'MetaMask' : 'Wallet Derivato'}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg flex justify-center">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Destinatario */}
        {sendType === 'contact' ? (
          <div className="break-all">
            <label className="block text-sm font-medium text-gray-700 mb-1 ">
              Destinatario
            </label>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium">{selectedUser.alias}</p>
              <p className="text-xs text-gray-500">{selectedUser.pub.slice(0, 8)}...</p>
              {recipientWalletInfo?.address && (
                <p className="text-xs text-gray-500 mt-1">
                  Indirizzo: {recipientWalletInfo.address.slice(0, 6)}...{recipientWalletInfo.address.slice(-4)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Indirizzo ETH
            </label>
            <input
              type="text"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Importo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Importo (ETH)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            step="0.0001"
            min="0"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Pulsante invio */}
        <button
          onClick={handleSend}
          disabled={isLoading || !amount || (sendType === 'custom' && !customAddress)}
          className={`w-full py-2 rounded-lg bg-blue-500 text-white transition-colors ${
            isLoading || !amount || (sendType === 'custom' && !customAddress)
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-blue-600'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
              Invio in corso...
            </div>
          ) : (
            'Invia'
          )}
        </button>
      </div>
    </div>
  );
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
  const [canWrite, setCanWrite] = React.useState(false);
  const [isInitializing, setIsInitializing] = React.useState(true);
  const [isSubscribing, setIsSubscribing] = React.useState(false);
  const previousRoomIdRef = React.useRef(null);
  const [isSubscribed, setIsSubscribed] = React.useState(true);
  const [shouldScrollToBottom, setShouldScrollToBottom] = React.useState(true);
  const lastMessageRef = React.useRef(null);
  const [displayName, setDisplayName] = React.useState('');
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState(Date.now());
  const messagesContainerRef = useRef(null);

  // Usa useMemo per creare una singola istanza del messageTracking
  const messageTracking = useMemo(() => createMessageTracking(), []);

  // Effetto per verificare i permessi di scrittura
  useEffect(() => {
    const checkPermissions = async () => {
      if (!chatData || !user?.is) {
        setCanWrite(false);
        return;
      }

      try {
        // Se è una chat privata
        if (!chatData.type || chatData.type === 'friend') {
          const messageCert = await gun.get(DAPP_NAME)
            .get('certificates')
            .get(chatData.user1 === user.is.pub ? chatData.user2 : chatData.user1)
            .get('messages')
            .then();

          if (!messageCert) {
            const otherPub = chatData.user1 === user.is.pub ? chatData.user2 : chatData.user1;
            const cert = await createMessagesCertificate(otherPub);
            setCanWrite(!!cert);
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

  // Usa useCallback per le funzioni che non devono essere ricreate
  const handleMessageVisible = useCallback((messageId) => {
    if (!selected?.pub || !selected?.roomId) return;
    const message = messages.find((m) => m.id === messageId);
    if (message && message.sender !== user.is.pub && !message.read) {
      messageTracking.updateMessageStatus(messageId, selected.roomId, 'read');
    }
  }, [selected?.pub, selected?.roomId, messages]);

  // Crea l'observer per i messaggi
  const messageObserver = useIntersectionObserver(handleMessageVisible, [
    selected?.pub,
    selected?.roomId,
  ]);

  // Funzione per caricare più messaggi
  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMoreMessages) return;

    try {
      setIsLoadingMore(true);

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

      const olderMessages = await messaging.chat.messageList.loadMessages(
        path, 
        id,
        20, // Carica 20 messaggi alla volta
        oldestMessageTimestamp
      );

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      // Processa i messaggi come prima
      let processedMessages = [];
      if (selected.type === 'friend') {
        processedMessages = await Promise.all(
          olderMessages.map(async (msg) => {
            try {
              if (typeof msg.content === 'string' && !msg.content.startsWith('SEA{')) {
                return msg;
              }
              return await messaging.chat.messageList.decryptMessage(msg, selected.pub);
            } catch (error) {
              console.warn('Error decrypting message:', error);
              return {
                ...msg,
                content: '[Messaggio non decifrabile]'
              };
            }
          })
        );
      } else {
        processedMessages = olderMessages;
      }

      // Aggiorna il timestamp del messaggio più vecchio
      const newOldestTimestamp = Math.min(
        ...processedMessages.map(msg => msg.timestamp)
      );
      setOldestMessageTimestamp(newOldestTimestamp);

      // Aggiungi i nuovi messaggi mantenendo l'ordine
      setMessages(prevMessages => {
        const allMessages = [...prevMessages, ...processedMessages];
        return allMessages.sort((a, b) => a.timestamp - b.timestamp);
      });

    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Gestione dello scroll
  const handleScroll = useCallback((e) => {
    const container = e.target;
    const { scrollTop, scrollHeight, clientHeight } = container;

    // Controlla se siamo vicini al top per caricare più messaggi
    if (scrollTop <= 100) {
      loadMoreMessages();
    }

    // Controlla se siamo vicini al bottom per l'auto-scroll
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldScrollToBottom(isNearBottom);
  }, [loadMoreMessages]);

  // Modifica l'effetto setupChat
  useEffect(() => {
    if (!selected?.roomId && !selected?.id) return;

    setIsSubscribed(true);
    setLoading(true);
    setIsInitializing(true);
    setMessages([]); // Reset immediato dei messaggi

    const setupChat = async () => {
      try {
        // Pulisci le sottoscrizioni precedenti
        if (messageSubscriptionRef.current) {
          if (typeof messageSubscriptionRef.current === 'function') {
            messageSubscriptionRef.current();
          } else if (messageSubscriptionRef.current.unsubscribe) {
            messageSubscriptionRef.current.unsubscribe();
          }
          messageSubscriptionRef.current = null;
        }

        // Determina il percorso
        let path = selected.type === 'friend' ? 'chats' : 
                   selected.type === 'channel' ? 'channels' : 'boards';
        let id = selected.type === 'friend' ? selected.roomId : selected.id;

        // Carica i messaggi iniziali
        const existingMessages = await messaging.chat.messageList.loadMessages(
          path, 
          id,
          20,
          Date.now()
        );

        if (!isSubscribed) return;

        // Processa i messaggi
        let processedMessages = selected.type === 'friend' ?
          await Promise.all(
            existingMessages.map(async (msg) => {
              try {
                if (!msg.content.startsWith('SEA{')) return msg;
                return await messaging.chat.messageList.decryptMessage(msg, selected.pub);
              } catch (error) {
                console.warn('Error decrypting message:', error);
                return { ...msg, content: '[Messaggio non decifrabile]' };
              }
            })
          ) : existingMessages;

        // Aggiorna i messaggi solo se siamo ancora sottoscritti
        if (isSubscribed) {
          if (processedMessages.length > 0) {
            setMessages(processedMessages.sort((a, b) => a.timestamp - b.timestamp));
            setOldestMessageTimestamp(Math.min(...processedMessages.map(m => m.timestamp)));
          }
          setLoading(false);
          setIsInitializing(false);
        }

        // Sottoscrivi ai nuovi messaggi
        const messageHandler = messaging.chat.messageList.subscribeToMessages(
          path,
          id,
          async (msg) => {
            if (!isSubscribed) return;
            try {
              let processedMsg = msg;
              if (selected.type === 'friend' && msg.content.startsWith('SEA{')) {
                processedMsg = await messaging.chat.messageList.decryptMessage(msg, selected.pub);
              }
              setMessages(prev => {
                if (prev.some(m => m.id === processedMsg.id)) return prev;
                return [...prev, processedMsg].sort((a, b) => a.timestamp - b.timestamp);
              });
            } catch (error) {
              console.warn('Error processing new message:', error);
            }
          }
        );

        messageSubscriptionRef.current = messageHandler;

      } catch (error) {
        console.error('Error setting up chat:', error);
        if (isSubscribed) {
          setError('Errore nel caricamento della chat');
          setLoading(false);
          setIsInitializing(false);
        }
      }
    };

    setupChat();

    return () => {
      setIsSubscribed(false);
      if (messageSubscriptionRef.current) {
        if (typeof messageSubscriptionRef.current === 'function') {
          try {
            messageSubscriptionRef.current();
          } catch (error) {
            console.warn('Error during cleanup:', error);
          }
        }
        messageSubscriptionRef.current = null;
      }
    };
  }, [selected?.roomId, selected?.id, selected?.type, selected?.pub]);

  // Usa useEffect con controllo di montaggio per le sottoscrizioni al profilo
  useEffect(() => {
    if (!chatData) return;
    
    let mounted = true;
    const otherPub = chatData.user1 === user?.is?.pub ? chatData.user2 : chatData.user1;
    
    const unsub = gun.get(DAPP_NAME)
      .get('userList')
      .get('nicknames')
      .get(otherPub)
      .on((nickname) => {
        if (!mounted) return;
        if (nickname) {
          setDisplayName(nickname);
        } else {
          setDisplayName(`${otherPub.slice(0, 6)}...${otherPub.slice(-4)}`);
        }
      });

    return () => {
      mounted = false;
      if (typeof unsub === 'function') unsub();
    };
  }, [chatData]);

  // Aggiungi un effetto separato per mantenere la chat corrente
  useEffect(() => {
    if (chatData) {
      console.log('Current chat updated:', chatData);
    }
  }, [chatData]);

  // Aggiungi un effetto per resettare la chat quando l'amico viene rimosso
  useEffect(() => {
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
  useEffect(() => {
    if (!selected?.roomId) return;
    const subscriptions = new Map(); // Usa una Map per tenere traccia delle sottoscrizioni

    // Funzione per sottoscriversi a un singolo messaggio
    const subscribeToMessage = (message) => {
      if (message.sender !== user.is.pub || subscriptions.has(message.id))
        return;

      const unsubscribe = chat.messageList.subscribeToReceipts(selected.roomId, message.id, (receipt) => {
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
  useEffect(() => {
    if (!selected?.roomId || !messages.length) return;

    // Trova l'ultimo messaggio
    const lastMessage = messages[messages.length - 1];

    // Se è un nostro messaggio, sottoscrivi alle sue ricevute
    if (lastMessage && lastMessage.sender === user.is.pub) {
      const unsubscribe = chat.messageList.subscribeToReceipts(selected.roomId, lastMessage.id, (receipt) => {
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
      let path, id;
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

      await chat.messageList.deleteMessage(path, id, messageId);
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      toast.success('Messaggio eliminato');
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Errore durante l\'eliminazione del messaggio');
    }
  };

  // Aggiungi questa funzione per gestire lo scroll
  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesEndRef.current && shouldScrollToBottom) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  };

  // Aggiungi questo effetto per gestire lo scroll automatico
  useEffect(() => {
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
  useEffect(() => {
    setShouldScrollToBottom(true);
    if (messagesEndRef.current) {
      scrollToBottom('auto');
    }
  }, [selected?.roomId]);

  // Funzione per ottenere il nome visualizzato
  const getDisplayName = async (pubKey) => {
    // Se è l'utente corrente
    if (pubKey === user?.is?.pub) {
      // Se  un wallet
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

  const handleSendTip = async (recipientPub, amount) => {
    try {
      await walletService.sendTip(recipientPub, amount);
      toast.success('Transazione completata con successo!');
    } catch (error) {
      console.error('Error sending tip:', error);
      toast.error(error.message || 'Errore nell\'invio');
    }
  };

  // Aggiungi la funzione sendMessage
  const sendMessage = async () => {
    if (!canWrite || !selected?.roomId || !newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      if (selected.type === 'friend') {
        // Prima cripta il messaggio
        const encryptedContent = await messaging.chat.messageList.encryptMessage(
          messageContent,
          selected.pub
        );

        if (!encryptedContent) {
          throw new Error('Errore durante la crittografia del messaggio');
        }

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const messageData = {
          id: messageId,
          content: encryptedContent,
          sender: user.is.pub,
          timestamp: Date.now()
        };

        // Salva il messaggio criptato
        await gun.get(DAPP_NAME)
          .get('chats')
          .get(selected.roomId)
          .get('messages')
          .get(messageId)
          .put(messageData);

      } else {
        // Per canali e bacheche il messaggio non viene criptato
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const messageData = {
          id: messageId,
          content: messageContent,
          sender: user.is.pub,
          senderAlias: user.is.alias || 'Unknown',
          timestamp: Date.now()
        };

        let path = selected.type === 'channel' ? 'channels' : 'boards';
        await gun.get(DAPP_NAME)
          .get(path)
          .get(selected.id)
          .get('messages')
          .get(messageId)
          .put(messageData);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(error.message || "Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  };

  // Aggiungi questa funzione nel componente Messages
  const handleDeleteAllMessages = async () => {
    if (!selected?.roomId) return;

    try {
      const isConfirmed = window.confirm('Sei sicuro di voler eliminare tutti i messaggi? Questa azione non può essere annullata.');
      
      if (!isConfirmed) return;

      setLoading(true);

      let path = selected.type === 'friend' ? 'chats' : 
                 selected.type === 'channel' ? 'channels' : 'boards';
      let id = selected.type === 'friend' ? selected.roomId : selected.id;

      await messaging.chat.messageList.deleteAllMessages(path, id);
      
      setMessages([]);
      toast.success('Tutti i messaggi sono stati eliminati');
    } catch (error) {
      console.error('Error deleting all messages:', error);
      toast.error('Errore durante l\'eliminazione dei messaggi');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="flex items-center space-x-2">
          {/* Aggiungi il pulsante per eliminare tutti i messaggi */}
          {selected.type === 'friend' && (
            <button
              onClick={handleDeleteAllMessages}
              className="p-2 hover:bg-red-100 rounded-full text-red-500"
              title="Elimina tutti i messaggi"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                />
              </svg>
            </button>
          )}
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-full"
            title="Apri wallet"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Area messaggi - Modifica questa parte */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        {/* Stato di caricamento iniziale */}
        {(isInitializing || loading) && (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            <p className="text-gray-500">Caricamento chat...</p>
          </div>
        )}

        {/* Stato di errore */}
        {!isInitializing && !loading && error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500">{error}</p>
          </div>
        )}

        {/* Stato nessun messaggio */}
        {!isInitializing && !loading && !error && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Nessun messaggio</p>
          </div>
        )}

        {/* Loader per caricamento messaggi aggiuntivi */}
        {isLoadingMore && (
          <div className="text-center py-2">
            <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
          </div>
        )}

        {/* Lista messaggi - mostra solo se non siamo in stato di caricamento iniziale */}
        {!isInitializing && !loading && !error && messages.length > 0 && (
          <>
            {messages
              .filter((message) => message && message.content)
              .map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  isOwnMessage={message.sender === user.is.pub}
                  showSender={true}
                  user={user}
                  messageObserver={messageObserver}
                  handleDeleteMessage={handleDeleteMessage}
                  selected={selected}
                />
              ))}
          </>
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
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onSend={handleSendTip}
        selectedUser={selected}
      />
    </div>
  );
}
