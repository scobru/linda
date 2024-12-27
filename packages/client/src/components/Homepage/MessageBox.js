import React from "react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const MessageBox = ({ message, isOwnMessage, onDelete, messageTracking }) => {
  const formattedTime = formatDistanceToNow(new Date(message.timestamp), {
    addSuffix: true,
    locale: it,
  });

  const isRead = messageTracking?.[message.id]?.read;

  return (
    <div
      className={`flex ${
        isOwnMessage ? "justify-end" : "justify-start"
      } mb-4 px-4`}
    >
      <div
        className={`max-w-[70%] rounded-lg p-3 ${
          isOwnMessage
            ? "bg-blue-500 text-white rounded-br-none"
            : "bg-gray-700 text-white rounded-bl-none"
        }`}
      >
        <div className="flex flex-col">
          <div className="break-words">{message.content}</div>
          <div className="flex items-center justify-end mt-1 space-x-1">
            <span className="text-xs opacity-75">{formattedTime}</span>
            {isOwnMessage && (
              <>
                {isRead ? (
                  <span className="text-xs">✓✓</span>
                ) : (
                  <span className="text-xs">✓</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {isOwnMessage && (
        <button
          onClick={() => onDelete(message.id)}
          className="ml-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg
            className="w-4 h-4"
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
    </div>
  );
};

export default MessageBox;
