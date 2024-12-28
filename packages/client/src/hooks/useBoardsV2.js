import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { messaging } from "linda-protocol";
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
      setLoading(true);
      setError(null);

      // Ottieni le board dell'utente
      const userBoards = await new Promise((resolve) => {
        const results = [];
        gun
          .user()
          .get("boards")
          .map()
          .once((data, boardId) => {
            if (data) {
              results.push({ ...data, id: boardId });
            }
          });
        setTimeout(() => resolve(results), 500);
      });

      // Ottieni i metadata per ogni board
      const boardsWithMetadata = await Promise.all(
        userBoards.map(async (board) => {
          const metadata = await messaging.boards.getMetadata(board.id);
          return {
            ...metadata,
            joined: board.joined,
            role: board.role,
          };
        })
      );

      setBoards(boardsWithMetadata.sort((a, b) => b.created - a.created));
    } catch (error) {
      console.error("Errore caricamento board:", error);
      setError(error.message);
      toast.error("Errore nel caricamento delle board");
    } finally {
      setLoading(false);
    }
  }, [appState.isAuthenticated]);

  // Crea una nuova board
  const createBoard = useCallback(
    async (boardData) => {
      try {
        setLoading(true);
        const result = await messaging.boards.create(boardData);
        await loadBoards(); // Ricarica la lista
        toast.success("Board creata con successo");
        return result;
      } catch (error) {
        console.error("Errore creazione board:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadBoards]
  );

  // Unisciti a una board
  const joinBoard = useCallback(
    async (boardId) => {
      try {
        setLoading(true);
        const result = await messaging.boards.join(boardId);
        await loadBoards(); // Ricarica la lista
        toast.success(
          result.role === "pending"
            ? "Richiesta di partecipazione inviata"
            : "Ti sei unito alla board"
        );
        return result;
      } catch (error) {
        console.error("Errore partecipazione board:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadBoards]
  );

  // Lascia una board
  const leaveBoard = useCallback(
    async (boardId) => {
      try {
        setLoading(true);
        await messaging.boards.leave(boardId);
        await loadBoards(); // Ricarica la lista
        toast.success("Hai lasciato la board");
      } catch (error) {
        console.error("Errore abbandono board:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadBoards]
  );

  // Elimina una board
  const deleteBoard = useCallback(
    async (boardId) => {
      try {
        setLoading(true);
        await messaging.boards.delete(boardId);
        await loadBoards(); // Ricarica la lista
        toast.success("Board eliminata");
      } catch (error) {
        console.error("Errore eliminazione board:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadBoards]
  );

  // Cerca board
  const searchBoards = useCallback(async (query, options = {}) => {
    try {
      setLoading(true);
      const results = await messaging.boards.search(query, options);
      return results;
    } catch (error) {
      console.error("Errore ricerca board:", error);
      toast.error("Errore nella ricerca");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Cambia ruolo di un membro
  const changeMemberRole = useCallback(async (boardId, userPub, newRole) => {
    try {
      setLoading(true);
      await messaging.boards.changeMemberRole(boardId, userPub, newRole);
      toast.success("Ruolo aggiornato con successo");
    } catch (error) {
      console.error("Errore cambio ruolo:", error);
      toast.error(error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Ottieni membri con un determinato ruolo
  const getMembersByRole = useCallback(async (boardId, role) => {
    try {
      return await messaging.boards.getMembersByRole(boardId, role);
    } catch (error) {
      console.error("Errore recupero membri:", error);
      throw error;
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
    deleteBoard,
    searchBoards,
    changeMemberRole,
    getMembersByRole,
    loadBoards,
  };
};
