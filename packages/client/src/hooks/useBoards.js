import { useState, useEffect, useCallback } from "react";
import { boardService } from "../protocol/services";
import { useAppState } from "../context/AppContext";
import { toast } from "react-hot-toast";

export const useBoards = () => {
  const { appState } = useAppState();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Carica la lista delle boards
  const loadBoards = useCallback(async () => {
    if (!appState.isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);
      const boardsList = await boardService.loadBoards();
      setBoards(boardsList);
    } catch (error) {
      console.error("Errore caricamento boards:", error);
      setError(error.message);
      toast.error("Errore nel caricamento delle boards");
    } finally {
      setLoading(false);
    }
  }, [appState.isAuthenticated]);

  // Crea una nuova board
  const createBoard = useCallback(
    async (boardData) => {
      try {
        setLoading(true);
        await boardService.createBoard(boardData);
        await loadBoards();
        toast.success("Board creata con successo");
      } catch (error) {
        console.error("Errore creazione board:", error);
        toast.error(error.message || "Errore nella creazione della board");
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
        await boardService.joinBoard(boardId);
        await loadBoards();
        toast.success("Ti sei unito alla board");
      } catch (error) {
        console.error("Errore partecipazione board:", error);
        toast.error(error.message || "Errore nell'unirsi alla board");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadBoards]
  );

  // Lascia una board
  const leaveBoard = useCallback(async (boardId) => {
    try {
      setLoading(true);
      await boardService.leaveBoard(boardId);
      setBoards((prevBoards) => prevBoards.filter((b) => b.id !== boardId));
      toast.success("Hai lasciato la board");
    } catch (error) {
      console.error("Errore abbandono board:", error);
      toast.error(error.message || "Errore nell'uscita dalla board");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Cerca boards
  const searchBoards = useCallback(async (query) => {
    try {
      setLoading(true);
      return await boardService.searchBoards(query);
    } catch (error) {
      console.error("Errore ricerca boards:", error);
      toast.error("Errore nella ricerca");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Elimina una board
  const deleteBoard = useCallback(async (boardId) => {
    try {
      setLoading(true);
      await boardService.deleteBoard(boardId);
      setBoards((prevBoards) => prevBoards.filter((b) => b.id !== boardId));
      toast.success("Board eliminata con successo");
    } catch (error) {
      console.error("Errore eliminazione board:", error);
      toast.error(error.message || "Errore nell'eliminazione della board");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Carica le boards all'avvio
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
    deleteBoard,
  };
};

export default useBoards;
