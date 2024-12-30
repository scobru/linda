import { useState, useCallback } from "react";
import { boardsService } from "#protocol";
import { toast } from "react-hot-toast";

export const useBoards = () => {
  const [loading, setLoading] = useState(false);
  const [boards, setBoards] = useState([]);

  const createBoard = useCallback(async (name, description) => {
    try {
      setLoading(true);
      await boardsService.createBoard(name, description);
      toast.success("Board creata con successo");
    } catch (error) {
      console.error("Errore creazione board:", error);
      toast.error("Errore nella creazione della board");
    } finally {
      setLoading(false);
    }
  }, []);

  const joinBoard = useCallback(async (boardId) => {
    try {
      setLoading(true);
      await boardsService.joinBoard(boardId);
      toast.success("Ti sei unito alla board");
    } catch (error) {
      console.error("Errore partecipazione board:", error);
      toast.error("Errore nella partecipazione alla board");
    } finally {
      setLoading(false);
    }
  }, []);

  const leaveBoard = useCallback(async (boardId) => {
    try {
      setLoading(true);
      await boardsService.leaveBoard(boardId);
      toast.success("Hai abbandonato la board");
    } catch (error) {
      console.error("Errore abbandono board:", error);
      toast.error("Errore nell'abbandono della board");
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteBoard = useCallback(async (boardId) => {
    try {
      setLoading(true);
      await boardsService.deleteBoard(boardId);
      toast.success("Board eliminata con successo");
    } catch (error) {
      console.error("Errore eliminazione board:", error);
      toast.error("Errore nell'eliminazione della board");
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    boards,
    createBoard,
    joinBoard,
    leaveBoard,
    deleteBoard,
  };
};
