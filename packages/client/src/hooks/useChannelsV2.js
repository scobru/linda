import { useState, useEffect, useCallback } from "react";
import { channelsV2 } from "linda-protocol";
import { useAppState } from "../context/AppContext";
import { toast } from "react-hot-toast";

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

      await channelsV2.list((response) => {
        if (response.success) {
          setChannels(response.channels.sort((a, b) => b.created - a.created));
        } else {
          setError(response.error || "Errore nel caricamento dei canali");
          toast.error(response.error || "Errore nel caricamento dei canali");
        }
      });
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
        return new Promise((resolve, reject) => {
          channelsV2.create(channelData, (response) => {
            if (response.success) {
              loadChannels();
              toast.success("Canale creato con successo");
              resolve(true);
            } else {
              toast.error(
                response.error || "Errore nella creazione del canale"
              );
              resolve(false);
            }
            setLoading(false);
          });
        });
      } catch (error) {
        console.error("Errore creazione canale:", error);
        toast.error(error.message || "Errore nella creazione del canale");
        setLoading(false);
        return false;
      }
    },
    [loadChannels]
  );

  // Unisciti a un canale
  const joinChannel = useCallback(
    async (channelId) => {
      try {
        setLoading(true);
        await channelsV2.join(channelId, (response) => {
          if (response.success) {
            loadChannels();
            toast.success("Ti sei unito al canale");
          } else {
            toast.error(response.error || "Errore nell'unirsi al canale");
          }
        });
      } catch (error) {
        console.error("Errore partecipazione canale:", error);
        toast.error(error.message || "Errore nell'unirsi al canale");
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
        await channelsV2.leave(channelId, (response) => {
          if (response.success) {
            loadChannels();
            toast.success("Hai lasciato il canale");
          } else {
            toast.error(response.error || "Errore nel lasciare il canale");
          }
        });
      } catch (error) {
        console.error("Errore abbandono canale:", error);
        toast.error(error.message || "Errore nel lasciare il canale");
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
        await channelsV2.delete(channelId, (response) => {
          if (response.success) {
            loadChannels();
            toast.success("Canale eliminato con successo");
          } else {
            toast.error(
              response.error || "Errore nell'eliminazione del canale"
            );
          }
        });
      } catch (error) {
        console.error("Errore eliminazione canale:", error);
        toast.error(error.message || "Errore nell'eliminazione del canale");
      } finally {
        setLoading(false);
      }
    },
    [loadChannels]
  );

  // Cerca canali
  const searchChannels = useCallback(async (query) => {
    try {
      setLoading(true);
      return new Promise((resolve) => {
        channelsV2.search(query, (response) => {
          if (response.success) {
            resolve(response.channels || []);
          } else {
            toast.error(response.error || "Errore nella ricerca dei canali");
            resolve([]);
          }
          setLoading(false);
        });
      });
    } catch (error) {
      console.error("Errore ricerca canali:", error);
      toast.error(error.message || "Errore nella ricerca dei canali");
      setLoading(false);
      return [];
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
