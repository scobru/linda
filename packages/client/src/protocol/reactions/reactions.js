import { gun } from "../useGun";

// Definizione delle reazioni disponibili
export const REACTIONS = {
  HEART: "❤️",
  SMILE: "😊",
  THUMBS_UP: "👍",
  LAUGH: "😂",
  WOW: "😮",
};

// Funzione per aggiungere una reazione
export const addReaction = async (
  contentType,
  contentId,
  reaction,
  userPub
) => {
  const reactionId = `${contentType}_${contentId}_${reaction}_${userPub}`;

  await gun
    .get("reactions")
    .get(contentType)
    .get(contentId)
    .get(reaction)
    .get(userPub)
    .put({
      reaction,
      userPub,
      timestamp: Date.now(),
    });

  return reactionId;
};

// Funzione per rimuovere una reazione
export const removeReaction = async (
  contentType,
  contentId,
  reaction,
  userPub
) => {
  await gun
    .get("reactions")
    .get(contentType)
    .get(contentId)
    .get(reaction)
    .get(userPub)
    .put(null);
};

// Funzione per ottenere tutte le reazioni per un contenuto
export const getReactions = async (contentType, contentId) => {
  return new Promise((resolve) => {
    const reactions = {};

    gun
      .get("reactions")
      .get(contentType)
      .get(contentId)
      .map()
      .on((reaction, key) => {
        if (!reactions[key]) {
          reactions[key] = [];
        }
        if (reaction) {
          reactions[key].push(reaction);
        }
      });

    setTimeout(() => resolve(reactions), 100);
  });
};

// Costanti per i tipi di contenuto
export const CONTENT_TYPES = {
  POST: "post",
  PRIVATE_MESSAGE: "private_message",
  BOARD_MESSAGE: "board_message",
  CHANNEL_MESSAGE: "channel_message",
};
