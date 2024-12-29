import { useState, useEffect, useCallback } from "react";
import { channelsV2 } from "linda-protocol";
import { useAppState } from "../context/AppContext";
import { toast } from "react-hot-toast";

export const useChannels = () => {
  const [channelList, setChannelList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { appState } = useAppState();

  // Carica la lista dei canali
  const loadChannels = useCallback(async () => {
    try {
      setLoading(true);
      await channelsV2.list((response) => {
        if (response.success) {
          setChannelList(response.channels);
        } else {
          toast.error(response.error || "Errore nel caricamento dei canali");
        }
      });
    } catch (error) {
      console.error("Errore caricamento canali:", error);
      toast.error("Errore nel caricamento dei canali");
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

  // Crea un nuovo canale
  const createChannel = async (name, isChannel = true) => {
    try {
      return new Promise((resolve, reject) => {
        channelsV2.create(
          {
            name,
            type: isChannel ? "channel" : "board",
          },
          (response) => {
            if (response.success) {
              toast.success("Canale creato con successo");
              loadChannels();
              resolve(true);
            } else {
              toast.error(
                response.error || "Errore nella creazione del canale"
              );
              resolve(false);
            }
          }
        );
      });
    } catch (error) {
      console.error("Errore creazione canale:", error);
      toast.error(error.message || "Errore nella creazione del canale");
      return false;
    }
  };

  // Unisciti a un canale
  const joinChannel = async (channelId) => {
    try {
      await channelsV2.join(channelId);
      toast.success("Ti sei unito al canale");
      loadChannels();
    } catch (error) {
      console.error("Errore partecipazione canale:", error);
      toast.error(error.message || "Errore nell'unirsi al canale");
      throw error;
    }
  };

  // Lascia un canale
  const leaveChannel = async (channelId) => {
    try {
      await channelsV2.leave(channelId);
      toast.success("Hai lasciato il canale");
      loadChannels();
    } catch (error) {
      console.error("Errore abbandono canale:", error);
      toast.error(error.message || "Errore nell'abbandonare il canale");
      throw error;
    }
  };

  // Elimina un canale
  const deleteChannel = async (channelId) => {
    try {
      await channelsV2.delete(channelId);
      toast.success("Canale eliminato con successo");
      loadChannels();
    } catch (error) {
      console.error("Errore eliminazione canale:", error);
      toast.error(error.message || "Errore nell'eliminazione del canale");
      throw error;
    }
  };

  // Cerca canali
  const searchChannels = async (query) => {
    try {
      const results = await channelsV2.search(query);
      return results.channels || [];
    } catch (error) {
      console.error("Errore ricerca canali:", error);
      toast.error("Errore nella ricerca dei canali");
      return [];
    }
  };

  // Verifica se l'utente è il creatore del canale
  const isChannelCreator = (channel) => {
    return channel.creator === appState.user?.is?.pub;
  };

  return {
    channelList,
    loading,
    createChannel,
    joinChannel,
    leaveChannel,
    deleteChannel,
    searchChannels,
    isChannelCreator,
    loadChannels,
  };
};
