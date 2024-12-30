import React, { useState, useRef } from "react";
import { toast, Toaster } from "react-hot-toast";
import { useAppState } from "../../../context/AppContext";
import { useMessages } from "../../../hooks/useMessages";
import { useChatUser } from "../../../hooks/useChatUser";
import { useChatPermissions } from "../../../hooks/useChatPermissions";
import { useMobileView } from "../../../hooks/useMobileView";
import { useFriends } from "../../../hooks/useFriends";
import { gun, DAPP_NAME, messaging, channelsV2 } from "#protocol";
import MessagesHeader from "./MessagesHeader";
import MessagesContent from "./MessagesContent";
import InputArea from "./InputArea";
import WalletModal from "../WalletModal";

const { messageList, chat } = messaging;

export default function Messages({ isMobileView = false, onBack }) {
  const { appState } = useAppState();
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
    loadMessages,
    isAuthorizedMember,
    authorizedMembers,
    setMessages,
  } = useMessages(selected);

  const { chatUserInfo, chatUserAvatar } = useChatUser(selected);
  const { canWrite, isBlocked } = useChatPermissions(selected);
  const { unblockUser } = useFriends();

  // Funzioni di gestione messaggi
  const handleSendMessage = async () => {
    // ... existing code ...
  };

  const handleVoiceMessage = async () => {
    // ... existing code ...
  };

  const handleImageMessage = async (file) => {
    // ... existing code ...
  };

  const handleDeleteMessage = async (messageId) => {
    // ... existing code ...
  };

  const handleClearChat = async () => {
    if (!selected?.roomId && !selected?.pub) return;

    try {
      // Chiedi conferma prima di procedere
      if (!window.confirm("Sei sicuro di voler cancellare tutti i messaggi?")) {
        return;
      }

      const loadingToast = toast.loading("Cancellazione messaggi in corso...");

      if (!selected.type || selected.type === "chat") {
        // Per le chat private
        const chatId = selected.roomId || selected.pub;

        // Usa chat.clearChat invece di messageList.clearMessages
        await new Promise((resolve, reject) => {
          chat.clearChat(chatId, (result) => {
            if (result.success) {
              resolve(result);
            } else {
              reject(
                new Error(result.errMessage || "Errore cancellazione chat")
              );
            }
          });
        });
      } else if (selected.type === "channel") {
        // Per i canali
        await channelsV2.clearMessages(selected.roomId, (response) => {
          if (!response.success) {
            throw new Error(response.error);
          }
        });
      } else {
        // Per le board
        await gun
          .get(DAPP_NAME)
          .get("boards")
          .get(selected.roomId)
          .get("messages")
          .map()
          .once((msg, id) => {
            if (msg) {
              gun
                .get(DAPP_NAME)
                .get("boards")
                .get(selected.roomId)
                .get("messages")
                .get(id)
                .put(null);
            }
          });
      }

      // Aggiorna la lista dei messaggi
      setMessages([]);

      // Mostra toast di successo
      toast.success("Messaggi cancellati con successo", { id: loadingToast });

      // Ricarica i messaggi dopo un breve delay
      setTimeout(() => {
        loadMessages();
      }, 1000);
    } catch (error) {
      console.error("Errore durante la cancellazione dei messaggi:", error);
      toast.error("Errore durante la cancellazione dei messaggi");
    }
  };

  const handleUnblock = async () => {
    // ... existing code ...
  };

  const handleUpdateChannelAvatar = async (channelId, avatar) => {
    // ... existing code ...
  };

  const handleUpdateBoardAvatar = async (boardId, avatar) => {
    // ... existing code ...
  };

  const handleDeleteBoard = async () => {
    // ... existing code ...
  };

  const handleLeaveBoard = async (boardId) => {
    // ... existing code ...
  };

  const handleDeleteChannel = async () => {
    // ... existing code ...
  };

  const handleLeaveChannel = async () => {
    // ... existing code ...
  };

  const handleRemoveMember = async (memberId) => {
    // ... existing code ...
  };

  if (!selected?.roomId) {
    return (
      <div className="flex items-center justify-center h-full bg-[#424874]">
        <p className="text-gray-500">
          {appState.currentView === "chats"
            ? "Seleziona un amico per chattare"
            : appState.currentView === "channels"
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
      <MessagesHeader
        selected={selected}
        isMobileView={isMobileView}
        onBack={onBack}
        chatUserInfo={chatUserInfo}
        chatUserAvatar={chatUserAvatar}
        authorizedMembers={authorizedMembers}
        appState={appState}
        handleUpdateChannelAvatar={handleUpdateChannelAvatar}
        handleUpdateBoardAvatar={handleUpdateBoardAvatar}
        handleDeleteBoard={handleDeleteBoard}
        handleLeaveBoard={handleLeaveBoard}
        handleDeleteChannel={handleDeleteChannel}
        handleLeaveChannel={handleLeaveChannel}
        setIsWalletModalOpen={setIsWalletModalOpen}
        handleClearChat={handleClearChat}
        handleUnblock={handleUnblock}
        isBlocked={isBlocked}
      />

      <MessagesContent
        loading={loading}
        messages={messages}
        isMobileView={isMobileView}
        appState={appState}
        handleDeleteMessage={handleDeleteMessage}
        messageStates={messageStates}
        selected={selected}
        handleRemoveMember={handleRemoveMember}
      />

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
        recipientPub={selected.pub}
        recipientName={chatUserInfo.displayName}
      />
    </div>
  );
}
