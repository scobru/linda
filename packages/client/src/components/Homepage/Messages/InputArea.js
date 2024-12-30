import React, { useState } from "react";
import { AiOutlineSend } from "react-icons/ai";

const InputArea = ({ onSendMessage, newMessage, setNewMessage }) => {
  return (
    <div className="p-3 bg-[#373B5C] border-t border-[#4A4F76]">
      <div className="flex items-center space-x-2 bg-[#2D325A] rounded-full px-4 py-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) =>
            e.key === "Enter" && !e.shiftKey && onSendMessage(newMessage)
          }
          placeholder="Scrivi un messaggio..."
          className="flex-1 bg-transparent text-white placeholder-gray-400 focus:outline-none border-none"
        />
        <button
          onClick={() => onSendMessage(newMessage)}
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
    </div>
  );
};

export default InputArea;
