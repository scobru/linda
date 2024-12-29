import React, { useEffect, useState } from "react";
import ReactionButton from "./ReactionButton";
import ReactionPicker from "./ReactionPicker";

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
      // Verifica se l'utente ha già reagito con questa emoji
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

      // Ricarica le reazioni
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
    <div className="flex items-center space-x-1">
      <div className="flex items-center space-x-1">
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
      <div className="border-l border-[#373B5C] pl-1">
        <ReactionPicker onSelectReaction={handleReactionSelect} />
      </div>
    </div>
  );
};

export default ReactionsContainer;
