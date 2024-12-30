import React, { useEffect, useState } from "react";
import { REACTIONS } from "../../protocol/reactions/reactions";

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
    } catch (error) {
      console.error("Errore nella gestione della reazione:", error);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="flex gap-1">
      {Object.values(REACTIONS).map((emoji) => {
        const users = reactions[emoji] || [];
        const count = users.length;
        const isActive = users.some((r) => r.userPub === currentUserPub);
        const tooltipTitle =
          users.length > 0
            ? users.map((u) => u.userPub).join(", ")
            : "Nessuna reazione";

        return (
          <div key={emoji} className="relative group">
            <button
              onClick={() => handleReactionSelect(emoji)}
              className={`
                inline-flex items-center px-2 py-1 rounded-full text-sm
                ${
                  isActive
                    ? "bg-blue-500 text-white"
                    : "bg-[#373B5C] text-white hover:bg-[#4A4F76]"
                }
                transition-colors duration-200
              `}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="ml-1">{count}</span>}
            </button>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
              {tooltipTitle}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ReactionsContainer;
