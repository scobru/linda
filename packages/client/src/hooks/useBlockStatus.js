import { useState, useCallback } from "react";
import { blocking, user } from "#protocol";

const { userBlocking } = blocking;

export const useBlockStatus = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkBlockStatus = useCallback(async (targetPub) => {
    if (!user.is || !targetPub) {
      return { blockedByMe: false, blockedByThem: false };
    }

    try {
      setLoading(true);
      setError(null);

      const [blockedByMe, blockedByThem] = await Promise.all([
        userBlocking.isBlocked(targetPub),
        userBlocking.isBlockedBy(targetPub),
      ]);

      return { blockedByMe, blockedByThem };
    } catch (error) {
      console.error("Errore controllo stato blocco:", error);
      setError(error.message);
      return { blockedByMe: false, blockedByThem: false };
    } finally {
      setLoading(false);
    }
  }, []);

  const blockUser = useCallback(async (targetPub) => {
    if (!user.is || !targetPub) return false;

    try {
      setLoading(true);
      setError(null);
      await userBlocking.block(targetPub);
      return true;
    } catch (error) {
      console.error("Errore blocco utente:", error);
      setError(error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const unblockUser = useCallback(async (targetPub) => {
    if (!user.is || !targetPub) return false;

    try {
      setLoading(true);
      setError(null);
      await userBlocking.unblock(targetPub);
      return true;
    } catch (error) {
      console.error("Errore sblocco utente:", error);
      setError(error.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    checkBlockStatus,
    blockUser,
    unblockUser,
  };
};
