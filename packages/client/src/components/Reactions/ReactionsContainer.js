import React, { useEffect, useState, useRef } from "react";
import ReactionButton from "./ReactionButton";

const ReactionsContainer = ({
  contentId,
  contentType,
  onAddReaction,
  onRemoveReaction,
  getReactions,
  currentUserPub,
}) => {
  const [reactions, setReactions] = useState({});
  const [loading, setLoading] = useState(true);
  const [showEmojiInput, setShowEmojiInput] = useState(false);
  const emojiButtonRef = useRef(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    const loadReactions = async () => {
      try {
        const reactionData = await getReactions(contentType, contentId);
        setReactions(reactionData);
      } catch (error) {
        console.error("Errore nel caricamento delle reazioni:", error);
      } finally {
        setLoading(false);
      }
    };

    loadReactions();
  }, [contentId, getReactions, contentType]);

  const handleReactionSelect = async (reaction) => {
    try {
      const hasReacted = reactions[reaction]?.some(
        (r) => r.userPub === currentUserPub
      );

      if (hasReacted) {
        await onRemoveReaction(
          contentType,
          contentId,
          reaction,
          currentUserPub
        );
      } else {
        await onAddReaction(contentType, contentId, reaction, currentUserPub);
      }

      const updatedReactions = await getReactions(contentType, contentId);
      setReactions(updatedReactions);
      setShowEmojiInput(false);
    } catch (error) {
      console.error("Errore nella gestione della reazione:", error);
    }
  };

  const handleEmojiInput = (e) => {
    const emoji = e.target.value;
    if (emoji) {
      handleReactionSelect(emoji);
      e.target.value = "";
    }
  };

  const handleEmojiButtonClick = () => {
    if (isMobile) {
      setShowEmojiInput(true);
    } else {
      // Per desktop, apriamo un elemento contenteditable che supporta l'input emoji
      const emojiPicker = document.createElement("div");
      emojiPicker.contentEditable = true;
      emojiPicker.style.opacity = "0";
      emojiPicker.style.position = "fixed";
      emojiPicker.style.pointerEvents = "none";
      document.body.appendChild(emojiPicker);

      emojiPicker.focus();

      const handleInput = (e) => {
        const emoji = emojiPicker.textContent;
        if (emoji) {
          handleReactionSelect(emoji);
        }
        document.body.removeChild(emojiPicker);
      };

      emojiPicker.addEventListener("input", handleInput);
      emojiPicker.addEventListener("blur", () => {
        document.body.removeChild(emojiPicker);
      });
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="flex items-center">
      <div className="flex flex-wrap gap-0.5 max-w-[140px]">
        {Object.entries(reactions).map(([emoji, users]) => (
          <ReactionButton
            key={emoji}
            emoji={emoji}
            count={users.length}
            isActive={users.some((r) => r.userPub === currentUserPub)}
            onClick={() => handleReactionSelect(emoji)}
            usernames={users.map((u) => u.userPub)}
          />
        ))}
      </div>
      <div className="ml-1" ref={emojiButtonRef}>
        <button
          onClick={handleEmojiButtonClick}
          className="p-1 rounded-full hover:bg-[#4A4F76] text-white transition-colors"
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
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>
        {isMobile && showEmojiInput && (
          <div className="absolute mt-1">
            <input
              type="text"
              className="w-8 h-8 opacity-0 absolute"
              onBlur={() => setShowEmojiInput(false)}
              onChange={handleEmojiInput}
              autoFocus
              inputMode="none"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ReactionsContainer;
