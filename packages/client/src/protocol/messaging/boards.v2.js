import { gun, user, DAPP_NAME } from "../useGun.js";

// Funzione per verificare se esiste già una board con lo stesso nome
const boardExists = async (name) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get("boards")
      .map()
      .once((board, id) => {
        if (
          board &&
          board.name &&
          board.name.toLowerCase() === name.toLowerCase()
        ) {
          resolve(true);
        }
      });
    setTimeout(() => resolve(false), 1000);
  });
};

// Funzione per formattare il nome utente
const formatUserName = async (pub) => {
  if (pub === user.is.pub) {
    return `${user.is.alias || "Utente"} (tu)`;
  }

  // Recupera l'alias dell'utente dal database
  const alias = await new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get("users")
      .get(pub)
      .get("alias")
      .once((alias) => {
        resolve(alias || "Utente");
      });
  });

  return alias;
};

export const boardsV2 = {
  // Crea una nuova board
  create: async (boardData, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      if (!boardData.name) {
        callback({
          success: false,
          error: "Il nome della board è obbligatorio",
        });
        return;
      }

      // Verifica se esiste già una board con lo stesso nome
      const exists = await boardExists(boardData.name);
      if (exists) {
        callback({
          success: false,
          error: "Esiste già una board con questo nome",
        });
        return;
      }

      const boardId = `board_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const board = {
        id: boardId,
        name: boardData.name,
        description: boardData.description || "",
        creator: user.is.pub,
        admins: {
          [user.is.pub]: {
            role: "admin",
            joinedAt: Date.now(),
          },
        },
        createdAt: Date.now(),
      };

      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .put(board, async (ack) => {
          if (ack.err) {
            callback({ success: false, error: ack.err });
            return;
          }

          const messageId = `system_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          const userName = await formatUserName(user.is.pub);
          const systemMessage = {
            id: messageId,
            type: "system",
            content: `📌 Board "${boardData.name}" creata da ${userName}`,
            sender: "system",
            timestamp: Date.now(),
          };

          gun
            .get(DAPP_NAME)
            .get("boards")
            .get(boardId)
            .get("messages")
            .get(messageId)
            .put(systemMessage);

          callback({ success: true, board });
        });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  // Lista tutte le board disponibili
  list: async (callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const boards = [];
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("boards")
          .map()
          .once((board, id) => {
            if (board) {
              boards.push({ ...board, id });
            }
          });
        setTimeout(resolve, 1000);
      });

      callback({ success: true, boards });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  // Cerca board per nome
  search: async (query = "", callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const results = [];
      const searchQuery = query.toLowerCase();

      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("boards")
          .map()
          .once((board, id) => {
            if (
              board &&
              board.name &&
              board.name.toLowerCase().includes(searchQuery)
            ) {
              results.push({ ...board, id });
            }
          });
        setTimeout(resolve, 1000);
      });

      callback({ success: true, boards: results });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  // Aggiungi un amministratore alla board
  addAdmin: async (boardId, userPub, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("boards")
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board) throw new Error("Board non trovata");
      if (board.creator !== user.is.pub)
        throw new Error("Solo il creatore può aggiungere amministratori");

      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("admins")
        .get(userPub)
        .put({
          role: "admin",
          joinedAt: Date.now(),
        });

      const messageId = `system_${Date.now()}`;
      const userName = await formatUserName(userPub);
      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("messages")
        .get(messageId)
        .put({
          id: messageId,
          type: "system",
          content: `👑 ${userName} è stato promosso ad amministratore`,
          sender: "system",
          timestamp: Date.now(),
        });

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  // Rimuovi un amministratore dalla board
  removeAdmin: async (boardId, userPub, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("boards")
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board) throw new Error("Board non trovata");
      if (board.creator !== user.is.pub)
        throw new Error("Solo il creatore può rimuovere amministratori");
      if (userPub === board.creator)
        throw new Error("Non puoi rimuovere il creatore");

      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("admins")
        .get(userPub)
        .put(null);

      const messageId = `system_${Date.now()}`;
      const userName = await formatUserName(userPub);
      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("messages")
        .get(messageId)
        .put({
          id: messageId,
          type: "system",
          content: `👋 ${userName} non è più amministratore`,
          sender: "system",
          timestamp: Date.now(),
        });

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  // Elimina un messaggio (solo amministratori)
  deleteMessage: async (boardId, messageId, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("boards")
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board) throw new Error("Board non trovata");
      if (!board.admins?.[user.is.pub])
        throw new Error("Solo gli amministratori possono eliminare i messaggi");

      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("messages")
        .get(messageId)
        .put(null);

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  // Elimina una board (solo il creatore)
  delete: async (boardId, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("boards")
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board) throw new Error("Board non trovata");
      if (board.creator !== user.is.pub)
        throw new Error("Solo il creatore può eliminare la board");

      // Elimina tutti i messaggi
      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("messages")
        .map()
        .once((msg, key) => {
          if (msg) {
            gun
              .get(DAPP_NAME)
              .get("boards")
              .get(boardId)
              .get("messages")
              .get(key)
              .put(null);
          }
        });

      // Elimina la board
      gun.get(DAPP_NAME).get("boards").get(boardId).put(null);

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  clearMessages: async (boardId, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("boards")
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board) throw new Error("Board non trovata");

      // Verifica che l'utente sia amministratore
      if (!board.admins?.[user.is.pub]) {
        throw new Error(
          "Solo gli amministratori possono cancellare i messaggi della board"
        );
      }

      // Cancella tutti i messaggi
      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("messages")
        .map()
        .once((msg, key) => {
          if (msg) {
            gun
              .get(DAPP_NAME)
              .get("boards")
              .get(boardId)
              .get("messages")
              .get(key)
              .put(null);
          }
        });

      // Aggiungi messaggio di sistema
      await gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("messages")
        .set({
          id: `system_${Date.now()}`,
          type: "system",
          content: `🧹 ${formatUserName(
            user.is.pub
          )} ha cancellato tutti i messaggi`,
          timestamp: Date.now(),
          sender: "system",
        });

      return callback({ success: true });
    } catch (error) {
      console.error("Errore cancellazione messaggi:", error);
      return callback({ success: false, error: error.message });
    }
  },
};
