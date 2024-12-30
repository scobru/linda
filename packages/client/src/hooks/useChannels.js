import { useState, useEffect, useCallback } from "react";
import { channelService } from "../protocol/services";
import { useAppState } from "../context/AppContext";
import { toast } from "react-hot-toast";

export const useChannels = () => {
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
      await channelService.list((response) => {
        if (response.success) {
          setChannels(response.channels);
        } else {
          setError(response.error);
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
        return new Promise((resolve) => {
          channelService.create(channelData, (response) => {
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
          });
        });
      } catch (error) {
        console.error("Errore creazione canale:", error);
        toast.error(error.message || "Errore nella creazione del canale");
        return false;
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
        await new Promise((resolve, reject) => {
          channelService.join(channelId, (response) => {
            if (response.success) {
              loadChannels();
              toast.success("Ti sei unito al canale");
              resolve();
            } else {
              toast.error(response.error || "Errore nell'unirsi al canale");
              reject(new Error(response.error));
            }
          });
        });
      } catch (error) {
        console.error("Errore partecipazione canale:", error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadChannels]
  );

  // Lascia un canale
  const leaveChannel = useCallback(async (channelId) => {
    try {
      setLoading(true);
      await new Promise((resolve, reject) => {
        channelService.leave(channelId, (response) => {
          if (response.success) {
            setChannels((prevChannels) =>
              prevChannels.filter((c) => c.id !== channelId)
            );
            toast.success("Hai lasciato il canale");
            resolve();
          } else {
            toast.error(response.error || "Errore nel lasciare il canale");
            reject(new Error(response.error));
          }
        });
      });
    } catch (error) {
      console.error("Errore abbandono canale:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Elimina un canale
  const deleteChannel = useCallback(async (channelId) => {
    try {
      setLoading(true);
      await new Promise((resolve, reject) => {
        channelService.delete(channelId, (response) => {
          if (response.success) {
            setChannels((prevChannels) =>
              prevChannels.filter((c) => c.id !== channelId)
            );
            toast.success("Canale eliminato con successo");
            resolve();
          } else {
            toast.error(
              response.error || "Errore nell'eliminazione del canale"
            );
            reject(new Error(response.error));
          }
        });
      });
    } catch (error) {
      console.error("Errore eliminazione canale:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Cerca canali
  const searchChannels = useCallback(async (query) => {
    try {
      setLoading(true);
      return new Promise((resolve) => {
        channelService.search(query, (response) => {
          if (response.success) {
            resolve(response.channels || []);
          } else {
            toast.error(response.error || "Errore nella ricerca dei canali");
            resolve([]);
          }
        });
      });
    } catch (error) {
      console.error("Errore ricerca canali:", error);
      toast.error("Errore nella ricerca dei canali");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Verifica se l'utente è il creatore del canale
  const isChannelCreator = useCallback(
    (channel) => {
      return channel.creator === appState.user?.is?.pub;
    },
    [appState.user?.is?.pub]
  );

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
    isChannelCreator,
    loadChannels,
  };
};

export default useChannels;
