/**
 * @module boardService
 * @description Servizio centralizzato per la gestione delle boards
 */

import { gun, user, DAPP_NAME } from "../useGun.js";

export const boardService = {
  /**
   * Carica la lista delle boards
   * @returns {Promise<Array>} Lista delle boards
   */
  loadBoards: async () => {
    return new Promise((resolve) => {
      const results = [];
      gun
        .get(DAPP_NAME)
        .get("boards")
        .map()
        .once(async (data, id) => {
          if (data && data.name) {
            const isCreator = data.creator === user.is.pub;

            if (isCreator) {
              results.push({
                ...data,
                id,
                avatar: data.avatar || null,
                isMember: true,
                isCreator,
                canWrite: true,
              });
              return;
            }

            // Verifica membership
            const memberData = await new Promise((resolveMember) => {
              gun
                .get(DAPP_NAME)
                .get("boards")
                .get(id)
                .get("members")
                .get(user.is.pub)
                .once((memberInfo) => resolveMember(memberInfo));
            });

            if (!memberData) return;

            const canWrite =
              memberData.canWrite === true ||
              memberData.permissions?.write === true;

            results.push({
              ...data,
              id,
              avatar: data.avatar || null,
              isMember: true,
              isCreator,
              canWrite,
            });
          }
        });

      setTimeout(() => {
        resolve(results.sort((a, b) => (b.created || 0) - (a.created || 0)));
      }, 2000);
    });
  },

  /**
   * Crea una nuova board
   * @param {Object} boardData - Dati della board
   * @returns {Promise<Object>} Risultato operazione
   */
  createBoard: async (boardData) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    const boardId = `board_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .put(
          {
            ...boardData,
            id: boardId,
            creator: user.is.pub,
            created: Date.now(),
            members: {
              [user.is.pub]: {
                role: "admin",
                joined: Date.now(),
                canWrite: true,
                permissions: {
                  read: true,
                  write: true,
                  timestamp: Date.now(),
                },
              },
            },
          },
          (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          }
        );
    });

    return { id: boardId };
  },

  /**
   * Unisciti a una board
   * @param {string} boardId - ID della board
   * @returns {Promise<Object>} Risultato operazione
   */
  joinBoard: async (boardId) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("members")
        .get(user.is.pub)
        .put(
          {
            role: "member",
            joined: Date.now(),
            canWrite: true,
            permissions: {
              read: true,
              write: true,
              timestamp: Date.now(),
            },
          },
          (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          }
        );
    });

    return { success: true, boardId };
  },

  /**
   * Lascia una board
   * @param {string} boardId - ID della board
   * @returns {Promise<void>}
   */
  leaveBoard: async (boardId) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    // Recupera alias utente
    const userAlias = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("users")
        .get(user.is.pub)
        .get("alias")
        .once((alias) => resolve(alias || "Utente"));
    });

    // Rimuovi membro
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("members")
        .get(user.is.pub)
        .put(null, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Aggiungi messaggio di sistema
    const messageId = `system_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    await gun
      .get(DAPP_NAME)
      .get("boards")
      .get(boardId)
      .get("messages")
      .get(messageId)
      .put({
        id: messageId,
        type: "system",
        content: `${userAlias} ha lasciato la board`,
        sender: "system",
        timestamp: Date.now(),
      });

    // Forza unsubscribe
    gun.get(DAPP_NAME).get("boards").get(boardId).off();
  },

  /**
   * Cerca boards
   * @param {string} query - Query di ricerca
   * @returns {Promise<Array>} Risultati ricerca
   */
  searchBoards: async (query) => {
    return new Promise((resolve) => {
      const foundBoards = [];
      gun
        .get(DAPP_NAME)
        .get("boards")
        .map()
        .once((data, id) => {
          if (
            data &&
            data.name &&
            data.name.toLowerCase().includes(query.toLowerCase())
          ) {
            foundBoards.push({ ...data, id });
          }
        });
      setTimeout(() => resolve(foundBoards), 1000);
    });
  },

  /**
   * Elimina una board
   * @param {string} boardId - ID della board
   * @returns {Promise<void>}
   */
  deleteBoard: async (boardId) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .once((board) => {
          if (!board) {
            reject(new Error("Board non trovata"));
            return;
          }
          if (board.creator !== user.is.pub) {
            reject(new Error("Solo il creatore può eliminare la board"));
            return;
          }

          // Elimina messaggi
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

          // Elimina board
          gun
            .get(DAPP_NAME)
            .get("boards")
            .get(boardId)
            .put(null, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        });
    });

    // Forza unsubscribe
    gun.get(DAPP_NAME).get("boards").get(boardId).off();
  },
};

export default boardService;
