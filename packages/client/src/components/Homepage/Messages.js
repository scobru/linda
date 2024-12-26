import React, { useState, useCallback, useEffect, useRef } from "react";
import Context from "../../contexts/context";
import { toast, Toaster } from "react-hot-toast";
import { AiOutlineSend } from "react-icons/ai";
import { messaging, blocking } from "linda-protocol";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { walletService } from "linda-protocol";
import { formatEther, parseEther } from "ethers";
import WalletModal from "./WalletModal";
import MessageBox from "./MessageBox";
import { useMessages } from "../../hooks/useMessages";
import { useChatUser } from "../../hooks/useChatUser";
import { useChatPermissions } from "../../hooks/useChatPermissions";
import { useMessageSending } from "../../hooks/useMessageSending";
import { useMobileView } from "../../hooks/useMobileView";

const { userBlocking } = blocking;
const { channels } = messaging;
const { chat } = messaging;

// Componente per l'area di input
const InputArea = ({
  canWrite,
  newMessage,
  setNewMessage,
  sendMessage,
  handleVoiceMessage,
  selected,
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
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

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

  const { canWrite, isBlocked, blockStatus } = useChatPermissions(
    selected,
    chatData
  );

  const {
    newMessage,
    setNewMessage,
    sendMessage,
    handleDeleteMessage,
    handleDeleteAllMessages,
    handleVoiceMessage,
    messageTracking,
  } = useMessageSending(selected, setMessages);

  const { currentIsMobileView } = useMobileView(isMobileView);

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
      <MessageBox
        messages={messages}
        loading={loading}
        isLoadingMore={isLoadingMore}
        messageTracking={messageTracking}
        selected={selected}
        handleDeleteMessage={handleDeleteMessage}
        loadMoreMessages={loadMoreMessages}
      />

      {/* Input area */}
      {canWrite ? (
        <InputArea
          canWrite={canWrite}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          sendMessage={sendMessage}
          handleVoiceMessage={handleVoiceMessage}
          selected={selected}
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
