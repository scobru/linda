import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import { Observable } from "rxjs";
import Context from "../../contexts/context";
import { toast, Toaster } from "react-hot-toast";
import { AiOutlineSend } from "react-icons/ai";
import { messaging, blocking } from "linda-protocol";
import { gun, user, notifications, DAPP_NAME } from "linda-protocol";
import { userUtils } from "linda-protocol";
import { createMessagesCertificate } from "linda-protocol";
import { walletService } from "linda-protocol";
import { formatEther, parseEther } from "ethers";
import WalletModal from "./WalletModal";
import { useIntersectionObserver } from "../../hooks/useIntersectionObserver";
import { useSendReceipt } from "../../hooks/useSendReceipt";
import { useMessageReceipts } from "../../hooks/useMessageReceipts";

const { userBlocking } = blocking;
const { channels } = messaging;
const { chat } = messaging;

// Custom hook per gestire lo stato dei messaggi
const useMessages = (selected, chatData) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState(
    Date.now()
  );

  const loadMessages = useCallback(async () => {
    if (!selected?.roomId && !selected?.id) return;

    try {
      setLoading(true);
      console.log("Caricamento messaggi per:", selected);

      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      // Carica i messaggi esistenti
      const existingMessages = await messaging.chat.messageList.loadMessages(
        path,
        id,
        null,
        Date.now()
      );

      console.log("Messaggi esistenti:", existingMessages);

      // Processa i messaggi esistenti
      const processedMessages = await Promise.all(
        existingMessages
          .filter((msg) => msg && msg.content)
          .map(async (msg) => {
            if (selected.type === "friend" && msg.content.startsWith("SEA{")) {
              try {
                const decrypted =
                  await messaging.chat.messageList.decryptMessage(
                    msg,
                    selected.pub
                  );
                return { ...msg, content: decrypted.content };
              } catch (error) {
                console.warn("Errore decrittazione:", error);
                return { ...msg, content: "[Errore decrittazione]" };
              }
            }
            return msg;
          })
      );

      setMessages(processedMessages.sort((a, b) => a.timestamp - b.timestamp));

      // Sottoscrizione ai nuovi messaggi
      const unsubMessages = gun
        .get(DAPP_NAME)
        .get(path)
        .get(id)
        .get("messages")
        .map()
        .on(async (data, key) => {
          if (!data) return;

          try {
            let processedMessage = { ...data, id: key };

            // Decrittazione per le chat private
            if (
              selected.type === "friend" &&
              data.content?.startsWith("SEA{")
            ) {
              const decrypted = await messaging.chat.messageList.decryptMessage(
                data,
                selected.pub
              );
              processedMessage.content = decrypted.content;
            }

            setMessages((prev) => {
              const exists = prev.some((m) => m.id === key);
              if (exists) {
                return prev.map((m) => (m.id === key ? processedMessage : m));
              }
              return [...prev, processedMessage].sort(
                (a, b) => a.timestamp - b.timestamp
              );
            });
          } catch (error) {
            console.error("Errore processamento messaggio:", error);
          }
        });

      return () => {
        if (typeof unsubMessages === "function") {
          unsubMessages();
        }
      };
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      setError("Errore nel caricamento dei messaggi");
    } finally {
      setLoading(false);
    }
  }, [selected?.roomId, selected?.id, selected?.type, selected?.pub]);

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMoreMessages) return;

    try {
      setIsLoadingMore(true);
      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      const olderMessages = await messaging.chat.messageList.loadMessages(
        path,
        id,
        20,
        oldestMessageTimestamp
      );

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      const processedMessages = await Promise.all(
        olderMessages.map(async (msg) => {
          if (selected.type === "friend" && msg.content.startsWith("SEA{")) {
            try {
              return await messaging.chat.messageList.decryptMessage(
                msg,
                selected.pub
              );
            } catch (error) {
              return { ...msg, content: "[Errore decrittazione]" };
            }
          }
          return msg;
        })
      );

      const newOldestTimestamp = Math.min(
        ...processedMessages.map((msg) => msg.timestamp)
      );
      setOldestMessageTimestamp(newOldestTimestamp);

      setMessages((prev) => {
        const allMessages = [...prev, ...processedMessages];
        return allMessages.sort((a, b) => a.timestamp - b.timestamp);
      });
    } catch (error) {
      console.error("Errore caricamento messaggi precedenti:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreMessages, oldestMessageTimestamp, selected]);

  return {
    messages,
    setMessages,
    loading,
    error,
    isLoadingMore,
    hasMoreMessages,
    loadMessages,
    loadMoreMessages,
  };
};

// Custom hook per gestire lo stato dell'utente della chat
const useChatUser = (selected, chatData) => {
  const [chatUserInfo, setChatUserInfo] = useState({
    displayName: selected?.name || "Loading...",
    username: "",
    nickname: "",
  });
  const [chatUserAvatar, setChatUserAvatar] = useState("");

  useEffect(() => {
    if (!selected?.pub || selected?.type !== "friend") return;

    const loadUserInfo = async () => {
      try {
        const info = await userUtils.getUserInfo(selected.pub);
        setChatUserInfo({
          displayName: info.nickname || info.username || selected.alias,
          username: info.username || "",
          nickname: info.nickname || "",
        });

        const avatar = await getUserAvatar(selected.pub);
        setChatUserAvatar(avatar);
      } catch (error) {
        console.error("Errore caricamento info utente:", error);
      }
    };

    loadUserInfo();

    // Sottoscrizioni al profilo utente
    const unsubUserList = gun
      .get(DAPP_NAME)
      .get("userList")
      .get("users")
      .get(selected.pub)
      .on((data) => {
        if (data) {
          setChatUserInfo((prev) => ({
            ...prev,
            displayName: data.nickname || data.username || selected.alias,
            username: data.username || prev.username,
            nickname: data.nickname || prev.nickname,
          }));
          if (data.avatar) setChatUserAvatar(data.avatar);
        }
      });

    const unsubUsers = gun
      .get(DAPP_NAME)
      .get("users")
      .get(selected.pub)
      .on((data) => {
        if (data) {
          setChatUserInfo((prev) => ({
            ...prev,
            displayName: data.nickname || data.username || selected.alias,
            username: data.username || prev.username,
            nickname: data.nickname || prev.nickname,
          }));
          if (data.avatar) setChatUserAvatar(data.avatar);
        }
      });

    return () => {
      if (typeof unsubUserList === "function") unsubUserList();
      if (typeof unsubUsers === "function") unsubUsers();
    };
  }, [selected?.pub, selected?.type, selected?.name, selected?.alias]);

  return { chatUserInfo, chatUserAvatar };
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
    await gun.get("chats").get(roomId).get("receipts").get(messageId).put({
      type: "sent",
      timestamp: Date.now(),
      by: user.is.pub,
    });
  },

  updateMessageStatus: async (messageId, roomId, status) => {
    if (!user.is || !messageId || !roomId) return;
    try {
      await gun.get("chats").get(roomId).get("receipts").get(messageId).put({
        type: status,
        timestamp: Date.now(),
        by: user.is.pub,
      });
    } catch (error) {
      console.warn(`Error updating message status to ${status}:`, error);
    }
  },

  observeMessageStatus: (messageId, roomId) => {
    return new Observable((subscriber) => {
      if (!messageId || !roomId) {
        subscriber.complete();
        return;
      }

      const handler = gun
        .get("chats")
        .get(roomId)
        .get("receipts")
        .get(messageId)
        .on((receipt) => {
          if (receipt) {
            subscriber.next({
              delivered: receipt.type === "delivery" || receipt.type === "read",
              read: receipt.type === "read",
              timestamp: receipt.timestamp,
              by: receipt.by,
            });
          }
        });

      return () => {
        if (typeof handler === "function") {
          handler();
        }
      };
    });
  },

  observeReadReceipts: (messageId, roomId) => {
    return new Observable((subscriber) => {
      if (!messageId || !roomId) {
        subscriber.complete();
        return;
      }

      const handler = gun
        .get("chats")
        .get(roomId)
        .get("receipts")
        .get(messageId)
        .on((receipt) => {
          if (receipt && receipt.type === "read") {
            subscriber.next(receipt);
          }
        });

      return () => {
        if (typeof handler === "function") {
          handler();
        }
      };
    });
  },
});

// Add this function to get the username
const getUserUsername = async (userPub) => {
  try {
    // Prima cerca nelle informazioni dell'utente
    const userInfo = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(userPub)
        .once((userData) => {
          resolve(userData);
        });
    });

    if (userInfo?.nickname) return userInfo.nickname;
    if (userInfo?.username) return userInfo.username;

    // Se non troviamo info nell'userList, cerca nell'account Gun
    const userData = await new Promise((resolve) => {
      gun.get(`~${userPub}`).once((data) => {
        resolve(data);
      });
    });

    if (userData?.alias) {
      return userData.alias.split(".")[0];
    }

    // Se non troviamo nulla, cerca nell'elenco amici
    const friendData = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("friendships")
        .map()
        .once((friendship) => {
          if (
            friendship &&
            (friendship.user1 === userPub || friendship.user2 === userPub)
          ) {
            resolve(friendship);
          }
        });
    });

    if (friendData?.alias) {
      return friendData.alias;
    }

    // Se non troviamo nulla, usa la chiave pubblica abbreviata
    return `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
  } catch (error) {
    console.warn("Errore nel recupero username:", error);
    return `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
  }
};

// Modifico la funzione getUserAvatar per gestire meglio le chat private
const getUserAvatar = async (userPub) => {
  try {
    console.log("Recupero avatar per:", userPub);

    // Prima prova nel percorso userList/users
    const avatarData = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(userPub)
        .get("avatar")
        .once((data) => {
          console.log("Avatar ricevuto da userList:", data);
          resolve(data);
        });
    });

    if (avatarData) return avatarData;

    // Se non trova nulla, prova nel percorso users
    const avatarData2 = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("users")
        .get(userPub)
        .get("avatar")
        .once((data) => {
          console.log("Avatar ricevuto da users:", data);
          resolve(data);
        });
    });

    return avatarData2;
  } catch (error) {
    console.warn("Errore nel recupero avatar:", error);
    return null;
  }
};

// Modify MessageItem component to better handle layout and truncated text
const MessageItem = ({
  message,
  isOwnMessage,
  showSender,
  user,
  messageObserver,
  handleDeleteMessage,
  selected,
}) => {
  const [senderName, setSenderName] = React.useState("");
  const [senderAvatar, setSenderAvatar] = React.useState("");
  const shouldShowSender = showSender && message.sender !== user.is.pub;
  const isCreator = selected?.creator === user.is.pub;

  useEffect(() => {
    const loadSenderInfo = async () => {
      try {
        if (isOwnMessage) {
          setSenderName("Tu");
          const myAvatar = await getUserAvatar(user.is.pub);
          console.log("Avatar utente corrente caricato:", myAvatar);
          setSenderAvatar(myAvatar);
        } else {
          const username = await getUserUsername(message.sender);
          setSenderName(username);
          const avatar = await getUserAvatar(message.sender);
          console.log("Avatar caricato per", message.sender, ":", avatar);
          setSenderAvatar(avatar);
        }
      } catch (error) {
        console.warn("Errore nel caricamento info mittente:", error);
        setSenderName(
          message.sender.slice(0, 6) + "..." + message.sender.slice(-4)
        );
      }
    };
    loadSenderInfo();
  }, [message.sender, isOwnMessage, user.is.pub]);

  return (
    <div
      ref={(el) => {
        if (el && messageObserver) {
          el.dataset.messageId = message.id;
          messageObserver.observe(el);
        }
      }}
      className={`flex flex-col ${
        isOwnMessage ? "items-end" : "items-start"
      } space-y-1`}
    >
      {/* Mostro sempre l'header con avatar e nome */}
      <div className="flex items-center mb-1">
        <div className="w-8 h-8 rounded-full flex-shrink-0">
          {senderAvatar ? (
            <img
              className="w-full h-full rounded-full object-cover"
              src={senderAvatar}
              alt="Avatar"
            />
          ) : (
            <img
              className="w-full h-full rounded-full"
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${senderName}&backgroundColor=b6e3f4`}
              alt="Avatar predefinito"
            />
          )}
        </div>
        <div className="ml-2 flex flex-col">
          <span className="text-sm text-white font-medium break-words">
            {isOwnMessage ? "Tu" : senderName}
          </span>
          <span className="text-xs text-gray-300">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Message content */}
      <div className="flex items-end w-full">
        <div
          className={`rounded-lg px-4 py-2 break-words ${
            isOwnMessage
              ? "bg-[#4A4F76] text-white rounded-br-none ml-auto"
              : "bg-[#2D325A] text-white rounded-bl-none"
          } max-w-full`}
        >
          {message.type === "voice" ? (
            <VoiceMessage
              content={message.content}
              isOwnMessage={isOwnMessage}
            />
          ) : (
            <span className="whitespace-pre-wrap">
              {typeof message.content === "string"
                ? message.content
                : "[Invalid message]"}
            </span>
          )}
        </div>
        {isOwnMessage && <MessageStatus message={message} />}
      </div>

      {/* Delete button */}
      {isCreator && selected?.type === "board" && (
        <button
          onClick={() => handleDeleteMessage(message.id)}
          className="text-red-400 text-xs hover:text-red-300 mt-1"
        >
          Delete
        </button>
      )}
    </div>
  );
};

// Add these message handling functions
const handleMessages = (data) => {
  try {
    console.log("Decrittazione:", data);
    if (!isSubscribed) return;

    if (data.initial) {
      const validMessages = (data.initial || []).filter(
        (msg) => msg && msg.content && msg.sender && msg.timestamp
      );

      const processedMessages =
        selected.type === "friend"
          ? validMessages.map((msg) =>
              messageList.decryptMessage(msg, msg.sender)
            )
          : validMessages;

      Promise.all(processedMessages).then((decryptedMessages) => {
        setMessages(decryptedMessages);
        setLoading(false);
      });
    }
  } catch (error) {
    console.error("Errore durante la decrittazione:", error);
  }
};

const handleError = (error) => {
  if (!isSubscribed) return;
  console.error("Error loading messages:", error);
  setError("Error loading messages");
  setLoading(false);
};

// Custom hook per gestire i permessi e lo stato della chat
const useChatPermissions = (selected, chatData) => {
  const [canWrite, setCanWrite] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockStatus, setBlockStatus] = useState({
    blockedByMe: false,
    blockedByOther: false,
  });

  useEffect(() => {
    const checkPermissions = async () => {
      if (!selected || !user?.is) {
        setCanWrite(false);
        return;
      }

      try {
        console.log("Verifica permessi per:", selected);

        // Per le bacheche, tutti possono scrivere
        if (selected.type === "board") {
          setCanWrite(true);
          return;
        }

        // Per i canali, solo il creatore può scrivere
        if (selected.type === "channel") {
          setCanWrite(selected.creator === user.is.pub);
          return;
        }

        // Per le chat private
        if (selected.type === "friend" || selected.type === "chat") {
          // Verifica lo stato di blocco
          const blockStatus = await userBlocking.getBlockStatus(selected.pub);
          setBlockStatus({
            blockedByMe: blockStatus.blocked,
            blockedByOther: blockStatus.blockedBy,
          });

          if (blockStatus.blocked || blockStatus.blockedBy) {
            setCanWrite(false);
            setIsBlocked(true);
            return;
          }

          // Verifica il certificato
          const cert = await gun
            .get(DAPP_NAME)
            .get("certificates")
            .get(selected.pub)
            .get("messages")
            .then();

          if (!cert) {
            try {
              console.log("Creazione certificato per:", selected.pub);
              const newCert = await createMessagesCertificate(selected.pub);
              setCanWrite(!!newCert);
            } catch (error) {
              console.warn("Errore creazione certificato:", error);
              setCanWrite(false);
            }
          } else {
            setCanWrite(true);
          }
        }
      } catch (error) {
        console.error("Errore verifica permessi:", error);
        setCanWrite(false);
      }
    };

    checkPermissions();
  }, [selected, user?.is]);

  return {
    canWrite,
    isBlocked,
    blockStatus,
  };
};

// Custom hook per gestire l'invio dei messaggi e le ricevute
const useMessageSending = (selected, setMessages) => {
  const [newMessage, setNewMessage] = useState("");
  const messageTracking = useMemo(() => createMessageTracking(), []);

  const sendMessage = async () => {
    if (!selected?.roomId || !newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      let messageData;

      if (selected.type === "friend") {
        // Cripta il messaggio per le chat private
        const encryptedContent =
          await messaging.chat.messageList.encryptMessage(
            messageContent,
            selected.pub
          );

        if (!encryptedContent) {
          throw new Error("Errore durante la crittografia del messaggio");
        }

        messageData = {
          id: messageId,
          content: encryptedContent,
          sender: user.is.pub,
          timestamp: Date.now(),
          type: "encrypted",
        };

        // Salva il messaggio criptato
        await gun
          .get(DAPP_NAME)
          .get("chats")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(messageData);

        // Inizializza il tracking
        await messageTracking.initMessageTracking(messageId, selected.roomId);
      } else {
        messageData = {
          id: messageId,
          content: messageContent,
          sender: user.is.pub,
          senderAlias: user.is.alias || "Unknown",
          timestamp: Date.now(),
          type: "plain",
        };

        const path = selected.type === "channel" ? "channels" : "boards";
        await gun
          .get(DAPP_NAME)
          .get(path)
          .get(selected.id)
          .get("messages")
          .get(messageId)
          .put(messageData);
      }

      // Aggiorna lo stato locale
      setMessages((prev) => [
        ...prev,
        {
          ...messageData,
          content: messageContent, // Usa il contenuto non criptato per la visualizzazione locale
        },
      ]);
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error(error.message || "Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (
      !selected?.roomId ||
      !selected?.creator ||
      selected.creator !== user.is.pub
    ) {
      return;
    }

    try {
      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      await chat.messageList.deleteMessage(path, id, messageId);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      toast.success("Messaggio eliminato");
    } catch (error) {
      console.error("Errore eliminazione messaggio:", error);
      toast.error("Errore durante l'eliminazione del messaggio");
    }
  };

  const handleDeleteAllMessages = async () => {
    if (!selected?.roomId) return;

    try {
      const isConfirmed = window.confirm(
        "Sei sicuro di voler eliminare tutti i messaggi? Questa azione non può essere annullata."
      );

      if (!isConfirmed) return;

      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      await messaging.chat.messageList.deleteAllMessages(path, id);
      setMessages([]);
      toast.success("Tutti i messaggi sono stati eliminati");
    } catch (error) {
      console.error("Errore eliminazione messaggi:", error);
      toast.error("Errore durante l'eliminazione dei messaggi");
    }
  };

  return {
    newMessage,
    setNewMessage,
    sendMessage,
    handleDeleteMessage,
    handleDeleteAllMessages,
    messageTracking,
  };
};

// Custom hook per gestire lo scroll e la visualizzazione dei messaggi
const useMessageViewing = (messages) => {
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const lastMessageRef = useRef(null);

  const scrollToBottom = useCallback(
    (behavior = "smooth") => {
      if (messagesEndRef.current && shouldScrollToBottom) {
        messagesEndRef.current.scrollIntoView({ behavior });
      }
    },
    [shouldScrollToBottom]
  );

  const handleScroll = useCallback((e) => {
    const container = e.target;
    const { scrollTop, scrollHeight, clientHeight } = container;

    // Controlla se siamo vicini al bottom per l'auto-scroll
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldScrollToBottom(isNearBottom);
  }, []);

  // Effetto per gestire lo scroll automatico
  useEffect(() => {
    if (messages.length > 0) {
      // Salva l'ultimo messaggio come riferimento
      lastMessageRef.current = messages[messages.length - 1];

      // Scroll immediato al primo caricamento
      if (messages.length === 1) {
        scrollToBottom("auto");
      } else {
        scrollToBottom();
      }
    }
  }, [messages, scrollToBottom]);

  // Effetto per gestire il resize della finestra
  useEffect(() => {
    const handleResize = () => {
      if (shouldScrollToBottom) {
        scrollToBottom("auto");
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [shouldScrollToBottom, scrollToBottom]);

  return {
    messagesEndRef,
    messagesContainerRef,
    handleScroll,
    scrollToBottom,
  };
};

// Custom hook per gestire la vista mobile
const useMobileView = (isMobileView) => {
  const [currentIsMobileView, setCurrentIsMobileView] = useState(isMobileView);

  useEffect(() => {
    const handleResize = () => {
      setCurrentIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return { currentIsMobileView };
};

// Funzione per gestire i messaggi vocali
const handleVoiceMessage = async (audioBlob) => {
  if (!selected?.roomId || !canWrite) return;

  try {
    // Converti il blob in base64
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const base64Audio = reader.result;
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      let messageData = {
        id: messageId,
        content: base64Audio,
        type: "voice",
        sender: user.is.pub,
        timestamp: Date.now(),
      };

      if (selected.type === "friend") {
        // Cripta il messaggio vocale per le chat private
        const encryptedContent =
          await messaging.chat.messageList.encryptMessage(
            base64Audio,
            selected.pub
          );

        if (!encryptedContent) {
          throw new Error(
            "Errore durante la crittografia del messaggio vocale"
          );
        }

        messageData.content = encryptedContent;

        await gun
          .get(DAPP_NAME)
          .get("chats")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(messageData);
      } else {
        // Per canali e bacheche
        const path = selected.type === "channel" ? "channels" : "boards";
        await gun
          .get(DAPP_NAME)
          .get(path)
          .get(selected.id)
          .get("messages")
          .get(messageId)
          .put(messageData);
      }

      toast.success("Messaggio vocale inviato");
    };
  } catch (error) {
    console.error("Errore invio messaggio vocale:", error);
    toast.error("Errore nell'invio del messaggio vocale");
  }
};

// Componente per il messaggio vocale
const VoiceMessage = ({ content, isOwnMessage }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

    const handleLoadedMetadata = () => {
      if (audio) {
        setDuration(audio.duration);
        setIsLoaded(true);
      }
    };

    const handleTimeUpdate = () => {
      if (audio) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    // Aggiungi gli event listener
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    // Cleanup
    return () => {
      if (audio) {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("ended", handleEnded);
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current || !isLoaded) return;

    if (audioRef.current.paused) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((error) => {
          console.error("Errore riproduzione audio:", error);
          setIsPlaying(false);
        });
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (time) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`flex items-center space-x-2 ${
        isOwnMessage ? "justify-end" : "justify-start"
      }`}
    >
      <audio ref={audioRef} src={content} preload="metadata" />
      <button
        onClick={togglePlay}
        disabled={!isLoaded}
        className={`p-2 rounded-full ${
          isLoaded ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-400"
        } text-white`}
      >
        {isPlaying ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      <div className="flex flex-col">
        <div className="text-xs text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
        <div className="w-32 h-1 bg-gray-200 rounded">
          <div
            className="h-full bg-blue-500 rounded"
            style={{
              width: `${isLoaded ? (currentTime / duration) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Modifica l'area di input per includere il pulsante di registrazione
const InputArea = ({
  canWrite,
  newMessage,
  setNewMessage,
  sendMessage,
  handleVoiceMessage,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        handleVoiceMessage(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Errore accesso microfono:", error);
      toast.error("Errore accesso al microfono");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="p-3 bg-[#373B5C] border-t border-[#4A4F76]">
      <div className="flex items-center space-x-2 bg-[#2D325A] rounded-full px-4 py-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Scrivi un messaggio..."
          className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none"
          disabled={isRecording}
        />
        {!isRecording ? (
          <>
            <button
              onClick={startRecording}
              className="p-2 rounded-full text-white hover:bg-[#4A4F76]"
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
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className={`p-2 rounded-full text-white ${
                !newMessage.trim()
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-[#4A4F76]"
              }`}
            >
              <AiOutlineSend className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button
            onClick={stopRecording}
            className="p-2 rounded-full text-red-500 hover:bg-[#4A4F76] animate-pulse"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default function Messages({ chatData, isMobileView = false, onBack }) {
  const { selected, setCurrentChat } = React.useContext(Context);

  // Utilizzo dei custom hooks
  const {
    messages,
    setMessages,
    loading,
    error,
    isLoadingMore,
    hasMoreMessages,
    loadMessages,
    loadMoreMessages,
  } = useMessages(selected, chatData);

  const { chatUserInfo, chatUserAvatar } = useChatUser(selected, chatData);

  const { canWrite, isBlocked, blockStatus, handleUnblock } =
    useChatPermissions(selected, chatData);

  const {
    newMessage,
    setNewMessage,
    sendMessage,
    handleDeleteMessage,
    handleDeleteAllMessages,
    messageTracking,
  } = useMessageSending(selected, setMessages);

  const { messagesEndRef, messagesContainerRef, handleScroll, scrollToBottom } =
    useMessageViewing(messages);

  const { currentIsMobileView } = useMobileView(isMobileView);

  // Gestione dell'intersection observer per i messaggi
  const handleMessageVisible = useCallback(
    (messageId) => {
      if (!selected?.pub || !selected?.roomId) return;
      const message = messages.find((m) => m.id === messageId);
      if (message && message.sender !== user.is.pub && !message.read) {
        messageTracking.updateMessageStatus(messageId, selected.roomId, "read");
      }
    },
    [selected?.pub, selected?.roomId, messages, messageTracking]
  );

  const messageObserver = useIntersectionObserver(handleMessageVisible, [
    selected?.pub,
    selected?.roomId,
  ]);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Effetto per caricare i messaggi quando cambia la chat
  useEffect(() => {
    if (selected?.roomId || selected?.id) {
      loadMessages();
    }
  }, [selected?.roomId, selected?.id, loadMessages]);

  // Handler per l'invio di mance
  const handleSendTip = async (amount, isStealthMode = false) => {
    if (!selected?.pub) {
      toast.error("Destinatario non valido");
      return;
    }

    try {
      setIsWalletModalOpen(false);
      const toastId = toast.loading("Invio della transazione in corso...");

      const amountInWei = parseEther(amount.toString());
      const tx = await walletService.sendTip(
        selected.pub,
        amountInWei,
        isStealthMode
      );
      await tx.wait();

      toast.success(
        `Transazione ${
          isStealthMode ? "stealth " : ""
        }completata con successo!`,
        { id: toastId }
      );

      // Invia messaggio di sistema
      const messageId = `tip_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const messageData = {
        id: messageId,
        content: `Ha inviato una mancia di ${amount} ETH${
          isStealthMode ? " (modalità stealth)" : ""
        }`,
        sender: user.is.pub,
        timestamp: Date.now(),
        type: "system",
      };

      await gun
        .get(DAPP_NAME)
        .get("chats")
        .get(selected.roomId)
        .get("messages")
        .get(messageId)
        .put(messageData);

      setMessages((prev) => [...prev, messageData]);
    } catch (error) {
      console.error("Errore invio mancia:", error);
      toast.error(error.message || "Errore durante l'invio della mancia");
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
    <div className="flex flex-col h-full w-full max-w-full bg-[#424874]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#373B5C] border-b border-[#4A4F76]">
        <div className="flex items-center">
          {currentIsMobileView && (
            <button
              onClick={onBack}
              className="mr-2 p-1.5 hover:bg-[#4A4F76] rounded-full md:hidden"
              aria-label="Torna indietro"
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            {chatUserAvatar ? (
              <img
                className="w-full h-full rounded-full object-cover"
                src={chatUserAvatar}
                alt="Avatar"
              />
            ) : (
              <img
                className="w-full h-full rounded-full"
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${chatUserInfo.displayName}&backgroundColor=b6e3f4`}
                alt="Avatar predefinito"
              />
            )}
          </div>
          <div className="ml-3">
            <p className="text-white font-medium">{chatUserInfo.displayName}</p>
            {chatUserInfo.username && (
              <p className="text-gray-300 text-sm">@{chatUserInfo.username}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {chatData &&
            chatData.type !== "channel" &&
            chatData.type !== "board" && (
              <button
                onClick={() => setIsWalletModalOpen(true)}
                className="text-white hover:bg-[#4A4F76] p-2 rounded-full"
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
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            )}
        </div>
      </div>

      {/* Area messaggi */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        onScroll={handleScroll}
      >
        {loading && (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
        {isLoadingMore && (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
          </div>
        )}
        {messages.map((message) => (
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {canWrite ? (
        <InputArea
          canWrite={canWrite}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          sendMessage={sendMessage}
          handleVoiceMessage={handleVoiceMessage}
        />
      ) : (
        <div className="p-4 bg-[#373B5C] text-center text-gray-400 border-t border-[#4A4F76]">
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

      {blockStatus.blockedByMe && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-red-500 mb-4">Hai bloccato questo utente</p>
          <button
            onClick={handleUnblock}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Sblocca utente
          </button>
        </div>
      )}
    </div>
  );
}
