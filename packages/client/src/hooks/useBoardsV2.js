import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { useAppState } from "../context/AppContext";

export const useBoardsV2 = () => {
  const { appState } = useAppState();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Carica la lista delle board
  const loadBoards = useCallback(async () => {
    if (!appState.isAuthenticated) return;

    try {
      console.log("Inizio caricamento board...");
      setLoading(true);
      setError(null);

      const userBoards = await new Promise((resolve) => {
        const results = [];
        gun
          .get(DAPP_NAME)
          .get("boards")
          .map()
          .once(async (data, id) => {
            console.log(`Analisi board ${id}:`, data);

            if (data && data.name) {
              // Verifica se l'utente è membro leggendo direttamente il nodo del membro
              const memberData = await new Promise((resolveMember) => {
                gun
                  .get(DAPP_NAME)
                  .get("boards")
                  .get(id)
                  .get("members")
                  .get(appState.user.is.pub)
                  .once((memberInfo) => {
                    console.log(`Verifica membro per ${id}:`, memberInfo);
                    resolveMember(memberInfo);
                  });
              });

              // Se memberData è null o undefined, l'utente non è un membro
              if (!memberData) {
                console.log(`Utente non è membro della board ${id}`);
                return;
              }

              const isCreator = data.creator === appState.user.is.pub;
              const canWrite =
                memberData.canWrite === true ||
                memberData.permissions?.write === true;

              console.log(`Risultato verifica per ${id}:`, {
                memberData,
                isCreator,
                canWrite,
              });

              results.push({
                ...data,
                id,
                isMember: true,
                isCreator,
                canWrite,
              });
              console.log(
                `Board ${id} aggiunta ai risultati con canWrite:`,
                canWrite
              );
            }
          });

        setTimeout(() => {
          console.log("Risultati finali loadBoards:", results);
          resolve(results);
        }, 2000);
      });

      console.log("Board caricate, imposto lo stato:", userBoards);
      setBoards(userBoards.sort((a, b) => (b.created || 0) - (a.created || 0)));
    } catch (error) {
      console.error("Errore caricamento board:", error);
      setError(error.message);
      toast.error("Errore nel caricamento delle board");
      setBoards([]);
    } finally {
      setLoading(false);
    }
  }, [appState.isAuthenticated, appState.user.is.pub]);

  // Crea una nuova board
  const createBoard = useCallback(
    async (boardData) => {
      try {
        setLoading(true);
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
                creator: appState.user.is.pub,
                created: Date.now(),
                members: {
                  [appState.user.is.pub]: {
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

        await loadBoards();
        toast.success("Board creata con successo");
        return { id: boardId };
      } catch (error) {
        console.error("Errore creazione board:", error);
        toast.error(error.message || "Errore durante la creazione della board");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadBoards, appState.user.is.pub]
  );

  // Unisciti a una board
  const joinBoard = useCallback(
    async (boardId) => {
      try {
        setLoading(true);
        console.log("Inizio processo di join per la board:", boardId);

        // Aggiungiamo il membro con i permessi integrati
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get("boards")
            .get(boardId)
            .get("members")
            .get(appState.user.is.pub)
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
                console.log("Risposta aggiunta membro:", ack);
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              }
            );
        });

        // Verifichiamo che l'aggiornamento sia avvenuto
        const memberData = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("boards")
            .get(boardId)
            .get("members")
            .get(appState.user.is.pub)
            .once((data) => {
              console.log("Verifica membro aggiunto:", data);
              resolve(data);
            });
        });

        if (!memberData || !memberData.canWrite) {
          throw new Error("Verifica aggiornamento fallita");
        }

        console.log("Ricarico le board dopo il join...");
        await loadBoards();
        toast.success("Ti sei unito alla board");
        return { success: true, boardId };
      } catch (error) {
        console.error("Errore partecipazione board:", error);
        toast.error(error.message || "Errore nell'unirsi alla board");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadBoards, appState.user.is.pub]
  );

  // Lascia una board
  const leaveBoard = useCallback(
    async (boardId) => {
      try {
        setLoading(true);
        console.log("Inizio processo di uscita dalla board:", boardId);

        // 1. Rimuoviamo completamente il nodo del membro
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get("boards")
            .get(boardId)
            .get("members")
            .get(appState.user.is.pub)
            .put(null, (ack) => {
              console.log("Risposta rimozione membro:", ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        });

        // 2. Verifichiamo che il membro sia stato rimosso
        const memberData = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("boards")
            .get(boardId)
            .get("members")
            .get(appState.user.is.pub)
            .once((data) => {
              console.log("Verifica rimozione membro:", data);
              resolve(data);
            });
        });

        if (memberData !== null) {
          throw new Error("Rimozione membro fallita");
        }

        // 3. Rimuoviamo immediatamente la board dalla lista locale
        setBoards((prevBoards) => {
          const newBoards = prevBoards.filter((board) => board.id !== boardId);
          console.log("Board rimosse localmente:", {
            prima: prevBoards.length,
            dopo: newBoards.length,
            boardId,
          });
          return newBoards;
        });

        // 4. Forziamo un unsubscribe dal nodo della board
        gun.get(DAPP_NAME).get("boards").get(boardId).off();

        toast.success("Hai lasciato la board");
      } catch (error) {
        console.error("Errore abbandono board:", error);
        toast.error(error.message || "Errore nell'uscita dalla board");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [appState.user.is.pub]
  );

  // Cerca board
  const searchBoards = useCallback(async (query) => {
    try {
      setLoading(true);
      const results = await new Promise((resolve) => {
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

      return results;
    } catch (error) {
      console.error("Errore ricerca board:", error);
      toast.error("Errore nella ricerca");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Carica le board all'avvio
  useEffect(() => {
    if (appState.isAuthenticated) {
      loadBoards();
    }
  }, [appState.isAuthenticated, loadBoards]);

  return {
    boards,
    loading,
    error,
    createBoard,
    joinBoard,
    leaveBoard,
    searchBoards,
    loadBoards,
  };
};
