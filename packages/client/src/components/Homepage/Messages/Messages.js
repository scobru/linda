import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAppState } from "../../../context/AppContext";
import { toast, Toaster } from "react-hot-toast";
import { AiOutlineSend } from "react-icons/ai";
import { messaging, blocking, channelsV2 } from "#protocol";
import { gun, user, DAPP_NAME } from "#protocol";
import { walletService } from "#protocol";
import { formatEther, parseEther } from "ethers";
import WalletModal from "../WalletModal";
import MessageBox from "./MessageBox";
import BlockStatus from "../BlockStatus";
import { useMessages } from "../../../hooks/useMessages";
import { useChatUser } from "../../../hooks/useChatUser";
import { useChatPermissions } from "../../../hooks/useChatPermissions";
import { useMessageSending } from "../../../hooks/useMessageSending";
import { useMobileView } from "../../../hooks/useMobileView";
import { useFriends } from "../../../hooks/useFriends";
import { useMessageNotifications } from "../../../hooks/useMessageNotifications";
import { useWallet } from "../../../hooks/useWallet";

const { userBlocking } = blocking;
const { channels, chat } = messaging;

// Componente per l'area di input
const InputArea = ({
  canWrite,
  newMessage,
  setNewMessage,
  sendMessage,
  handleVoiceMessage,
  handleImageMessage,
  selected,
  isMobileView,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);

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
        handleVoiceMessage(audioBlob, selected);
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

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        // Limite di 5MB
        toast.error("L'immagine non può superare i 5MB");
        return;
      }

      if (!file.type.startsWith("image/")) {
        toast.error("Per favore seleziona un'immagine valida");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        handleImageMessage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      className={`p-3 bg-[#373B5C] border-t border-[#4A4F76] ${
        isMobileView ? "fixed bottom-0 left-0 right-0" : ""
      }`}
    >
      <div className="flex items-center space-x-2 bg-[#2D325A] rounded-full px-4 py-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="Scrivi un messaggio..."
          className="flex-1 min-w-0 bg-transparent text-white placeholder-gray-400 focus:outline-none border-none"
          disabled={isRecording}
        />
        {!isRecording ? (
          <div className="flex items-center space-x-2 flex-shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current.click()}
              className="p-2 rounded-full text-white hover:bg-[#4A4F76]"
              title="Allega immagine"
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
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </button>
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
          </div>
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

export default function Messages({ isMobileView = false, onBack }) {
  const { appState, updateAppState } = useAppState();
  const { currentView } = appState;
  const { selected } = appState;
  const [newMessage, setNewMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [messageStates, setMessageStates] = useState({});
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const messageEndRef = useRef(null);
  const audioRef = useRef(null);
  const recordingInterval = useRef(null);

  const {
    messages,
    loading,
    error,
    isLoadingMore,
    hasMoreMessages,
    loadMessages,
    loadMoreMessages,
    sendMessage: updateMessages,
    clearMessages,
    isAuthorizedMember,
    authorizedMembers,
  } = useMessages(selected);

  // Log per debug
  console.log("Messages - AppState:", appState);
  console.log("Messages - Selected:", selected);

  const { chatUserInfo, chatUserAvatar } = useChatUser(selected);
  const { canWrite, isBlocked, blockStatus } = useChatPermissions(selected);
  const { currentIsMobileView } = useMobileView(isMobileView);
  const { unblockUser } = useFriends();

  // Funzione per inviare messaggi
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      if (selected.type === "board") {
        console.log("----- SENDING MESSAGE TO BOARD -----");
        // Verifica se l'utente è autorizzato a scrivere nella board
        if (!isAuthorizedMember(appState.user.is.pub)) {
          toast.error("Non sei autorizzato a scrivere in questa board");
          return;
        }

        // Gestione messaggi board usando Gun
        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const message = {
          id: messageId,
          content: newMessage,
          sender: appState.user.is.pub,
          senderAlias: appState.user.is.alias,
          timestamp: Date.now(),
          type: "text",
        };

        await gun
          .get(DAPP_NAME)
          .get("boards")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(message);

        setNewMessage("");
      } else if (selected.type === "channel") {
        console.log("----- SENDING MESSAGE TO CHANNEL -----");
        // Per i canali
        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const messageData = {
          id: messageId,
          content: newMessage,
          sender: appState.user.is.pub,
          timestamp: Date.now(),
          type: "text",
        };

        await gun
          .get(DAPP_NAME)
          .get("channels")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(messageData);

        setNewMessage("");
      } else {
        console.log("----- SENDING MESSAGE TO FRIEND -----");
        // Per le chat private
        await new Promise((resolve, reject) => {
          chat.sendMessage(
            selected.chatId,
            selected.pub,
            newMessage,
            (result) => {
              if (result.success) {
                resolve(result);
              } else {
                reject(
                  new Error(result.errMessage || "Errore invio messaggio")
                );
              }
            }
          );
        });

        setNewMessage("");
      }
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error("Errore nell'invio del messaggio");
    }
  };

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
        sender: appState.user.is.pub,
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

      updateMessages(messageData);
    } catch (error) {
      console.error("Errore invio mancia:", error);
      toast.error(error.message || "Errore durante l'invio della mancia");
    }
  };

  // Funzione per cancellare la chat
  const handleClearChat = async () => {
    if (!selected?.roomId) return;
    try {
      if (selected.type === "channel") {
        // Per i canali, usa la funzione clearMessages di channelsV2
        await channelsV2.clearMessages(selected.roomId, (response) => {
          if (response.success) {
            toast.success("Messaggi cancellati con successo");
            loadMessages(); // Ricarica i messaggi
          } else {
            throw new Error(response.error);
          }
        });
      } else {
        // Per le chat private, mantieni il comportamento esistente
        const messages = await new Promise((resolve) => {
          const msgs = [];
          gun
            .get(DAPP_NAME)
            .get("chats")
            .get(selected.roomId)
            .get("messages")
            .map()
            .once((msg, id) => {
              if (msg) {
                msgs.push({ ...msg, id });
              }
            });
          setTimeout(() => resolve(msgs), 500);
        });

        await Promise.all(
          messages.map(
            (msg) =>
              new Promise((resolve) => {
                gun
                  .get(DAPP_NAME)
                  .get("chats")
                  .get(selected.roomId)
                  .get("messages")
                  .get(msg.id)
                  .put(null, (ack) => resolve(!ack.err));
              })
          )
        );

        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("chats")
            .get(selected.roomId)
            .get("lastMessage")
            .put(null, (ack) => resolve(!ack.err));
        });

        toast.success("Chat cancellata con successo");
        loadMessages();
      }
    } catch (error) {
      console.error("Errore durante la cancellazione:", error);
      toast.error(error.message || "Errore durante la cancellazione");
    }
  };

  // Funzione per sbloccare un utente
  const handleUnblock = async () => {
    if (!selected?.pub) return;
    try {
      await unblockUser(selected.pub);
      toast.success("Utente sbloccato con successo");
      // Aggiorna lo stato dell'app per riflettere lo sblocco
      updateAppState({
        ...appState,
        selected: {
          ...selected,
          isBlocked: false,
        },
      });
    } catch (error) {
      console.error("Errore sblocco utente:", error);
      toast.error("Errore durante lo sblocco dell'utente");
    }
  };

  // Funzione per uscire dal canale
  const handleLeaveChannel = async () => {
    if (!selected?.roomId || selected?.type !== "channel") return;

    try {
      // Rimuovi l'utente dai membri del canale
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(selected.roomId)
        .get("members")
        .get(user.is.pub)
        .put(null);

      // Aggiungi un messaggio di sistema
      const messageId = `system_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(selected.roomId)
        .get("messages")
        .get(messageId)
        .put({
          id: messageId,
          type: "system",
          content: `👋 ${
            appState.user.is.alias || "Utente"
          } ha lasciato il canale`,
          sender: "system",
          timestamp: Date.now(),
        });

      // Rimuovi il canale dalla lista dei canali dell'utente
      await gun.user().get("channels").get(selected.roomId).put(null);

      toast.success("Hai lasciato il canale");
      updateAppState({
        ...appState,
        selected: null,
      });
    } catch (error) {
      console.error("Errore nell'uscita dal canale:", error);
      toast.error(error.message || "Errore nell'uscita dal canale");
    }
  };

  // Funzione per eliminare il canale
  const handleDeleteChannel = async () => {
    if (!selected?.roomId || !selected?.type === "channel") return;
    try {
      await channelsV2.delete(selected.roomId, (response) => {
        if (response.success) {
          toast.success("Canale eliminato con successo");
          // Resetta la selezione corrente
          updateAppState({
            ...appState,
            selected: null,
            currentView: "channels",
          });
          // Forza il ricaricamento dei canali nel componente Channels
          window.dispatchEvent(new CustomEvent("channelDeleted"));
        } else {
          throw new Error(response.error);
        }
      });
    } catch (error) {
      console.error("Errore nell'eliminazione del canale:", error);
      toast.error("Errore nell'eliminazione del canale");
    }
  };

  // Funzione per rimuovere un membro dalla board
  const handleRemoveMember = async (memberPub) => {
    if (
      !selected?.roomId ||
      !selected?.type === "board" ||
      selected.creator !== appState.pub
    )
      return;

    try {
      // Rimuovi il membro dalla lista dei membri autorizzati
      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(selected.roomId)
        .get("members")
        .get(memberPub)
        .put(false); // Impostiamo a false invece di null per mantenere traccia dei membri rimossi

      // Aggiungi un messaggio di sistema
      const messageId = `system_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const message = {
        id: messageId,
        content: `${appState.alias} ha rimosso un membro dalla board`,
        sender: appState.pub,
        senderAlias: "Sistema",
        timestamp: Date.now(),
        type: "system",
      };

      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(selected.roomId)
        .get("messages")
        .get(messageId)
        .put(message);

      toast.success("Membro rimosso dalla board");
    } catch (error) {
      console.error("Errore rimozione membro:", error);
      toast.error("Errore durante la rimozione del membro");
    }
  };

  // Funzione per cancellare un messaggio (per il creatore)
  const handleDeleteBoardMessage = async (messageId) => {
    if (
      !selected?.roomId ||
      !selected?.type === "board" ||
      selected.creator !== appState.pub
    )
      return;

    try {
      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(selected.roomId)
        .get("messages")
        .get(messageId)
        .put(null);

      toast.success("Messaggio cancellato");
    } catch (error) {
      console.error("Errore cancellazione messaggio:", error);
      toast.error("Errore durante la cancellazione del messaggio");
    }
  };

  // Funzione per gestire i messaggi vocali
  const handleVoiceMessage = async (audioBlob) => {
    if (!selected?.roomId) return;

    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        const audioUrl = reader.result;
        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const message = {
          id: messageId,
          content: `[VOICE]${audioUrl}`,
          sender: appState.user.is.pub,
          senderAlias: appState.user.is.alias,
          timestamp: Date.now(),
          type: "voice",
        };

        try {
          if (selected.type === "board") {
            await gun
              .get(DAPP_NAME)
              .get("boards")
              .get(selected.roomId)
              .get("messages")
              .get(messageId)
              .put(message);
          } else if (selected.type === "channel") {
            console.log("----- SENDING VOICE MESSAGE TO CHANNEL -----");
            await channelsV2.sendVoiceMessage(
              selected.roomId,
              audioBlob,
              (result) => {
                if (result.success) {
                  toast.success("Messaggio vocale inviato");
                } else {
                  throw new Error(
                    result.error || "Errore invio messaggio vocale"
                  );
                }
              }
            );
          } else {
            // Per le chat private
            await new Promise((resolve, reject) => {
              chat.sendMessage(
                selected.chatId,
                selected.pub,
                `[VOICE]${audioUrl}`,
                (result) => {
                  if (result.success) {
                    resolve(result);
                  } else {
                    reject(
                      new Error(
                        result.errMessage || "Errore invio messaggio vocale"
                      )
                    );
                  }
                }
              );
            });
          }

          toast.success("Messaggio vocale inviato");
        } catch (error) {
          console.error("Errore invio messaggio:", error);
          toast.error("Errore nell'invio del messaggio");
        }
      };
    } catch (error) {
      console.error("Errore invio messaggio vocale:", error);
      toast.error("Errore nell'invio del messaggio vocale");
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!selected?.roomId) return;

    try {
      if (selected.type === "board") {
        await gun
          .get(DAPP_NAME)
          .get("boards")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(null);
      } else if (selected.type === "channel") {
        await channelsV2.deleteMessage(selected.roomId, messageId);
      } else {
        // Per le chat private
        await gun
          .get(DAPP_NAME)
          .get("chats")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(null);
      }

      toast.success("Messaggio eliminato con successo");
      loadMessages(); // Ricarica i messaggi
    } catch (error) {
      console.error("Errore eliminazione messaggio:", error);
      toast.error("Errore durante l'eliminazione del messaggio");
    }
  };

  // Funzione per gestire i messaggi immagine
  const handleImageMessage = async (imageData) => {
    if (!selected?.roomId) return;

    try {
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const message = {
        id: messageId,
        content: `[IMAGE]${imageData}`,
        sender: appState.user.is.pub,
        senderAlias: appState.user.is.alias,
        timestamp: Date.now(),
        type: "image",
      };

      if (selected.type === "board") {
        await gun
          .get(DAPP_NAME)
          .get("boards")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(message);
      } else if (selected.type === "channel") {
        console.log("----- SENDING IMAGE MESSAGE TO CHANNEL -----");
        await channelsV2.sendImageMessage(
          selected.roomId,
          imageData,
          (result) => {
            if (result.success) {
              toast.success("Immagine inviata con successo");
            } else {
              throw new Error(result.error || "Errore invio immagine");
            }
          }
        );
      } else {
        // Per le chat private
        await new Promise((resolve, reject) => {
          chat.sendMessage(
            selected.chatId,
            selected.pub,
            `[IMAGE]${imageData}`,
            (result) => {
              if (result.success) {
                resolve(result);
              } else {
                reject(new Error(result.errMessage || "Errore invio immagine"));
              }
            }
          );
        });
      }

      toast.success("Immagine inviata con successo");
    } catch (error) {
      console.error("Errore invio immagine:", error);
      toast.error("Errore nell'invio dell'immagine");
    }
  };

  // Effetti
  useEffect(() => {
    if (selected?.roomId) {
      loadMessages();
    }
  }, [selected?.roomId, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      const messageContainer = document.querySelector(".message-container");
      if (messageContainer) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }
    }
  }, [messages]);

  useMessageNotifications(messages, selected?.type);

  // Aggiungi questa funzione per gestire l'uscita dalla board
  const handleLeaveBoard = async (boardId) => {
    if (!boardId) return;

    try {
      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("members")
        .get(appState.user.is.pub)
        .put(false);

      // Aggiungi un messaggio di sistema
      const messageId = `system_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const message = {
        id: messageId,
        content: `${appState.user.is.alias} ha lasciato la board`,
        sender: appState.user.is.pub,
        senderAlias: "Sistema",
        timestamp: Date.now(),
        type: "system",
      };

      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("messages")
        .get(messageId)
        .put(message);

      toast.success("Hai lasciato la board");
      // Resetta la selezione corrente
      window.location.reload();
    } catch (error) {
      console.error("Errore nell'uscita dalla board:", error);
      toast.error("Errore nell'uscita dalla board");
    }
  };

  // Funzione per eliminare una board
  const handleDeleteBoard = async () => {
    if (!selected?.roomId || selected?.type !== "board") return;

    try {
      await gun.get(DAPP_NAME).get("boards").get(selected.roomId).put(null);

      toast.success("Board eliminata con successo");
      // Resetta la selezione corrente
      updateAppState({
        ...appState,
        selected: null,
        currentView: "boards",
      });
      // Forza il ricaricamento delle board
      window.dispatchEvent(new CustomEvent("boardDeleted"));
    } catch (error) {
      console.error("Errore nell'eliminazione della board:", error);
      toast.error("Errore nell'eliminazione della board");
    }
  };

  // Funzione per aggiornare l'avatar del canale
  const handleUpdateChannelAvatar = async (channelId, avatar) => {
    try {
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("avatar")
        .put(avatar);
      toast.success("Avatar del canale aggiornato");
    } catch (error) {
      console.error("Errore aggiornamento avatar:", error);
      toast.error("Errore durante l'aggiornamento dell'avatar");
    }
  };

  // Funzione per aggiornare l'avatar della board
  const handleUpdateBoardAvatar = async (boardId, avatar) => {
    try {
      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("avatar")
        .put(avatar);
      toast.success("Avatar della board aggiornato");
    } catch (error) {
      console.error("Errore aggiornamento avatar:", error);
      toast.error("Errore durante l'aggiornamento dell'avatar");
    }
  };

  if (!selected?.roomId) {
    return (
      <div className="flex items-center justify-center h-full bg-[#424874]">
        <p className="text-gray-500">
          {currentView === "chats"
            ? "Seleziona un amico per chattare"
            : currentView === "channels"
            ? "Seleziona un canale"
            : "Seleziona una board"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full w-full max-w-full bg-[#424874] ${
        isMobileView ? "fixed inset-0 z-50" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#373B5C] border-b border-[#4A4F76] sticky top-0 z-10">
        <div className="flex items-center">
          {isMobileView && (
            <button
              onClick={onBack}
              className="mr-2 p-1.5 hover:bg-[#4A4F76] rounded-full"
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
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
            {selected.type === "board" ? (
              selected.avatar ? (
                <img
                  src={selected.avatar}
                  alt={selected.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-white text-lg font-semibold">
                  {selected.name?.charAt(0).toUpperCase()}
                </span>
              )
            ) : selected.type === "channel" ? (
              selected.avatar ? (
                <img
                  src={selected.avatar}
                  alt={selected.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-white text-lg font-semibold">
                  {selected.name?.charAt(0).toUpperCase()}
                </span>
              )
            ) : chatUserAvatar ? (
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
          <div className="ml-3 flex items-center">
            <div>
              <p className="text-white font-medium">
                {selected.type === "board"
                  ? selected.name || "Board"
                  : selected.type === "channel"
                  ? selected.name
                  : chatUserInfo.displayName}
              </p>
              {selected.type === "board" && (
                <p className="text-gray-300 text-sm flex items-center gap-2">
                  <span>
                    Creata da:{" "}
                    {selected.creator === appState.user.is.pub
                      ? "Te"
                      : selected.creatorAlias || "Sconosciuto"}
                  </span>
                  <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                  <span title="Numero di membri">
                    {Object.keys(authorizedMembers).length}{" "}
                    {Object.keys(authorizedMembers).length === 1
                      ? "membro"
                      : "membri"}
                  </span>
                </p>
              )}
              {selected.type !== "channel" &&
                selected.type !== "board" &&
                chatUserInfo.username && (
                  <p className="text-gray-300 text-sm">
                    @{chatUserInfo.username}
                  </p>
                )}
            </div>
            {(selected.type === "channel" || selected.type === "board") &&
              selected.creator === appState.user.is.pub && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = async (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        if (file.size > 2 * 1024 * 1024) {
                          toast.error("L'immagine non può superare i 2MB");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          if (selected.type === "channel") {
                            handleUpdateChannelAvatar(
                              selected.roomId,
                              reader.result
                            );
                          } else {
                            handleUpdateBoardAvatar(
                              selected.roomId,
                              reader.result
                            );
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    };
                    input.click();
                  }}
                  className="ml-2 p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76]"
                  title="Cambia avatar"
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
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {selected.type === "board" && (
            <>
              {selected.creator === appState.user.is.pub ? (
                <button
                  onClick={handleDeleteBoard}
                  className="p-2 rounded-full text-red-500 hover:bg-[#4A4F76]"
                  title="Elimina board"
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
              ) : (
                <button
                  onClick={() => handleLeaveBoard(selected.roomId)}
                  className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76] transition-colors"
                  title="Esci dalla board"
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
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              )}
            </>
          )}
          {selected.type === "channel" && (
            <>
              {selected.creator === appState.user.is.pub ? (
                <button
                  onClick={handleDeleteChannel}
                  className="p-2 rounded-full text-red-500 hover:bg-[#4A4F76]"
                  title="Elimina canale"
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
              ) : (
                <button
                  onClick={handleLeaveChannel}
                  className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76] transition-colors"
                  title="Esci dal canale"
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
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              )}
            </>
          )}
          {(!selected.type || selected.type === "global" || selected.pub) && (
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="p-2 rounded-full text-white hover:bg-[#4A4F76]"
              title="Invia mancia"
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
          <button
            onClick={handleClearChat}
            className="p-2 rounded-full text-white hover:bg-[#4A4F76]"
            title="Cancella messaggi"
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
          {isBlocked && (
            <button
              onClick={handleUnblock}
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
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Area messaggi */}
      <div
        className={`flex-1 overflow-y-auto message-container ${
          isMobileView ? "pb-20" : ""
        }`}
      >
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Nessun messaggio
          </div>
        ) : (
          messages.map((message) => (
            <MessageBox
              key={message.id}
              message={message}
              isOwnMessage={message.sender === appState.user.is.pub}
              onDelete={handleDeleteMessage}
              messageStates={messageStates}
              showDeleteButton={
                message.sender === appState.user.is.pub ||
                (selected.type === "board" &&
                  selected.creator === appState.user.is.pub)
              }
              showRemoveMember={
                selected.type === "board" &&
                selected.creator === appState.user.is.pub &&
                message.sender !== appState.user.is.pub
              }
              onRemoveMember={handleRemoveMember}
              isVoiceMessage={
                message.type === "voice" ||
                message.content?.startsWith("[VOICE]") ||
                message.content?.startsWith("data:audio")
              }
              messageType={selected.type || "private"}
            />
          ))
        )}
      </div>

      {/* Input area */}
      {canWrite ? (
        <InputArea
          canWrite={canWrite}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          sendMessage={handleSendMessage}
          handleVoiceMessage={handleVoiceMessage}
          handleImageMessage={handleImageMessage}
          selected={selected}
          isMobileView={isMobileView}
        />
      ) : (
        <div
          className={`p-4 bg-[#373B5C] text-center text-gray-400 border-t border-[#4A4F76] ${
            isMobileView ? "fixed bottom-0 left-0 right-0" : ""
          }`}
        >
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

      <BlockStatus targetPub={selected?.pub} />
    </div>
  );
}
