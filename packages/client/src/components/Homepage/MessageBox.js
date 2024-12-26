import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageItem } from "./MessageItem";
import { useIntersectionObserver } from "../../hooks/useIntersectionObserver";
import { user } from "linda-protocol";

const MessageBox = ({
  messages,
  loading,
  isLoadingMore,
  messageTracking,
  selected,
  handleDeleteMessage,
  loadMoreMessages,
}) => {
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

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

  const scrollToBottom = useCallback(
    (behavior = "smooth") => {
      if (messagesEndRef.current && shouldScrollToBottom) {
        messagesEndRef.current.scrollIntoView({ behavior });
      }
    },
    [shouldScrollToBottom]
  );

  const handleScroll = useCallback(
    (e) => {
      const container = e.target;
      const { scrollTop, scrollHeight, clientHeight } = container;

      // Controlla se siamo vicini al top per caricare più messaggi
      if (scrollTop === 0 && !isLoadingMore) {
        loadMoreMessages?.();
      }

      // Controlla se siamo vicini al bottom per l'auto-scroll
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShouldScrollToBottom(isNearBottom);
    },
    [isLoadingMore, loadMoreMessages]
  );

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const isNewMessage = lastMessage.timestamp > Date.now() - 1000;

      if (isNewMessage || messages.length === 1) {
        scrollToBottom("auto");
      } else if (shouldScrollToBottom) {
        scrollToBottom();
      }
    }
  }, [messages, scrollToBottom, shouldScrollToBottom]);

  useEffect(() => {
    const handleResize = () => {
      if (shouldScrollToBottom) {
        scrollToBottom("auto");
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [shouldScrollToBottom, scrollToBottom]);

  const renderMessage = useCallback(
    (message) => {
      const isOwnMessage = message.sender === user.is.pub;
      return (
        <MessageItem
          key={message.id}
          message={message}
          isOwnMessage={isOwnMessage}
          showSender={true}
          user={user}
          messageObserver={messageObserver}
          handleDeleteMessage={handleDeleteMessage}
          selected={selected}
        />
      );
    },
    [messageObserver, handleDeleteMessage, selected]
  );

  return (
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
      {messages.map(renderMessage)}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageBox;
