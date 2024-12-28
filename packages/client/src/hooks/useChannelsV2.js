import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import { messaging } from "linda-protocol";
import { useAppState } from "../context/AppContext";

export const useChannelsV2 = () => {
  const { appState } = useAppState();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Carica la lista dei canali
  const loadChannels = useCallback(async () => {
    if (!appState.isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);

      // Ottieni i canali dell'utente
      const userChannels = await new Promise((resolve) => {
        const results = [];
        gun
          .user()
          .get("channels")
          .map()
          .once((data, channelId) => {
            if (data) {
              results.push({ ...data, id: channelId });
            }
          });
        setTimeout(() => resolve(results), 500);
      });

      // Ottieni i metadata per ogni canale
      const channelsWithMetadata = await Promise.all(
        userChannels.map(async (channel) => {
          const metadata = await messaging.channels.getMetadata(channel.id);
          return {
            ...metadata,
            joined: channel.joined,
            role: channel.role,
          };
        })
      );

      setChannels(channelsWithMetadata.sort((a, b) => b.created - a.created));
    } catch (error) {
      console.error("Errore caricamento canali:", error);
      setError(error.message);
      toast.error("Errore nel caricamento dei canali");
    } finally {
      setLoading(false);
    }
  }, [appState.isAuthenticated]);

  // Crea un nuovo canale
  const createChannel = useCallback(
    async (channelData) => {
      try {
        setLoading(true);
        const result = await messaging.channels.create(channelData);
        await loadChannels(); // Ricarica la lista
        toast.success("Canale creato con successo");
        return result;
      } catch (error) {
        console.error("Errore creazione canale:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadChannels]
  );

  // Unisciti a un canale
  const joinChannel = useCallback(
    async (channelId) => {
      try {
        setLoading(true);
        await messaging.channels.join(channelId);
        await loadChannels(); // Ricarica la lista
        toast.success("Ti sei unito al canale");
      } catch (error) {
        console.error("Errore partecipazione canale:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadChannels]
  );

  // Lascia un canale
  const leaveChannel = useCallback(
    async (channelId) => {
      try {
        setLoading(true);
        await messaging.channels.leave(channelId);
        await loadChannels(); // Ricarica la lista
        toast.success("Hai lasciato il canale");
      } catch (error) {
        console.error("Errore abbandono canale:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadChannels]
  );

  // Elimina un canale
  const deleteChannel = useCallback(
    async (channelId) => {
      try {
        setLoading(true);
        await messaging.channels.delete(channelId);
        await loadChannels(); // Ricarica la lista
        toast.success("Canale eliminato");
      } catch (error) {
        console.error("Errore eliminazione canale:", error);
        toast.error(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadChannels]
  );

  // Cerca canali
  const searchChannels = useCallback(async (query, options = {}) => {
    try {
      setLoading(true);
      const results = await messaging.channels.search(query, options);
      return results;
    } catch (error) {
      console.error("Errore ricerca canali:", error);
      toast.error("Errore nella ricerca");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Carica i canali all'avvio
  useEffect(() => {
    if (appState.isAuthenticated) {
      loadChannels();
    }
  }, [appState.isAuthenticated, loadChannels]);

  return {
    channels,
    loading,
    error,
    createChannel,
    joinChannel,
    leaveChannel,
    deleteChannel,
    searchChannels,
    loadChannels,
  };
};
