import React from "react";
import MessageBox from "./MessageBox";

const MessagesContent = ({
  loading,
  messages,
  isMobileView,
  appState,
  handleDeleteMessage,
  messageStates,
  selected,
  handleRemoveMember,
}) => {
  return (
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
  );
};

export default MessagesContent;
