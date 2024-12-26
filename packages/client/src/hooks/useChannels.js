import { useState, useCallback, useEffect, useRef } from "react";
import { messaging, gun, DAPP_NAME, user } from "linda-protocol";
import { toast } from "react-hot-toast";

const { channels } = messaging;

export const useChannels = () => {
  const [channelList, setChannelList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const processedChannelsRef = useRef(new Set());

  // Carica la lista dei canali e bacheche
  const loadChannels = useCallback(async () => {
    try {
      setLoading(true);
      const channelMap = new Map();
      processedChannelsRef.current.clear();

      // Prima carica la lista dei canali dell'utente
      const userChannels = new Set();
      await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get("my_channels")
          .map()
          .on((data) => {
            if (data && data.channelId) {
              userChannels.add(data.channelId);
            }
          });
        setTimeout(resolve, 500);
      });

      console.log("Canali iscritto:", Array.from(userChannels));

      // Poi carica i dettagli solo dei canali a cui l'utente è iscritto
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .map()
          .on(async (data, channelId) => {
            if (
              !data ||
              !userChannels.has(channelId) ||
              processedChannelsRef.current.has(channelId)
            )
              return;

            processedChannelsRef.current.add(channelId);
            console.log("Caricamento dettagli canale:", channelId, data);

            try {
              const membersCount = await channels.countMembers(channelId);

              channelMap.set(channelId, {
                ...data,
                id: channelId,
                joined: true,
                members: membersCount,
                isChannel: data.type === "channel",
                name: data.name || "Canale senza nome",
                creator: data.creator,
                created: data.created || Date.now(),
                type: data.type || "channel",
                messages: data.messages || {},
              });

              // Aggiorna la lista dei canali ogni volta che viene aggiunto un nuovo canale
              const sortedChannels = Array.from(channelMap.values()).sort(
                (a, b) => b.created - a.created
              );
              console.log("Lista canali aggiornata:", sortedChannels);
              setChannelList(sortedChannels);
            } catch (error) {
              console.error("Errore caricamento dettagli canale:", error);
            }
          });

        setTimeout(resolve, 1000);
      });
    } catch (error) {
      console.error("Errore caricamento canali:", error);
      setError("Errore nel caricamento dei canali");
      toast.error("Errore nel caricamento dei canali");
    } finally {
      setLoading(false);
    }
  }, []);

  // Crea un nuovo canale
  const createChannel = useCallback(
    async (name, isChannel = true) => {
      try {
        setLoading(true);
        const channelId = `channel_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        // Crea il nuovo canale con struttura completa
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("channels")
            .get(channelId)
            .put(
              {
                name,
                type: isChannel ? "channel" : "board",
                creator: user.is.pub,
                created: Date.now(),
                messages: {},
                members: {},
                settings: {
                  isPublic: true,
                  canWrite: true,
                },
              },
              (ack) => {
                if (ack.err) {
                  throw new Error(ack.err);
                }
                resolve();
              }
            );
        });

        // Aggiungi il canale alla lista dei canali dell'utente
        await new Promise((resolve) => {
          gun
            .user()
            .get(DAPP_NAME)
            .get("my_channels")
            .set(
              {
                channelId,
                joined: Date.now(),
              },
              (ack) => {
                if (ack.err) {
                  throw new Error(ack.err);
                }
                resolve();
              }
            );
        });

        toast.success(
          `${isChannel ? "Canale" : "Bacheca"} creato con successo!`
        );
        await loadChannels();
        return channelId;
      } catch (error) {
        console.error("Errore creazione canale:", error);
        toast.error("Errore nella creazione");
        setError("Errore nella creazione del canale");
      } finally {
        setLoading(false);
      }
    },
    [loadChannels]
  );

  // Entra in un canale
  const joinChannel = useCallback(
    async (channelId) => {
      try {
        setLoading(true);
        await new Promise((resolve) => {
          gun
            .user()
            .get(DAPP_NAME)
            .get("my_channels")
            .set(
              {
                channelId,
                joined: Date.now(),
              },
              (ack) => {
                if (ack.err) {
                  throw new Error(ack.err);
                }
                resolve();
              }
            );
        });

        toast.success("Iscrizione effettuata con successo!");
        await loadChannels();
        return true;
      } catch (error) {
        console.error("Errore iscrizione canale:", error);
        toast.error("Errore nell'iscrizione");
        setError("Errore nell'iscrizione al canale");
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
        await new Promise((resolve) => {
          gun
            .user()
            .get(DAPP_NAME)
            .get("my_channels")
            .get(channelId)
            .put(null, (ack) => {
              if (ack.err) {
                throw new Error(ack.err);
              }
              resolve();
            });
        });

        toast.success("Disiscrizione effettuata con successo!");
        await loadChannels();
        return true;
      } catch (error) {
        console.error("Errore disiscrizione canale:", error);
        toast.error("Errore nella disiscrizione");
        setError("Errore nella disiscrizione dal canale");
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
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("channels")
            .get(channelId)
            .put(null, (ack) => {
              if (ack.err) {
                throw new Error(ack.err);
              }
              resolve();
            });
        });

        toast.success("Canale eliminato con successo!");
        await loadChannels();
        return true;
      } catch (error) {
        console.error("Errore eliminazione canale:", error);
        toast.error("Errore nell'eliminazione");
        setError("Errore nell'eliminazione del canale");
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
      const results = [];
      const searchPromise = new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .map()
          .once(async (data, id) => {
            if (!data || !data.name) return;
            if (data.name.toLowerCase().includes(query.toLowerCase())) {
              const membersCount = await channels.countMembers(id);
              results.push({
                ...data,
                id,
                members: membersCount,
                isChannel: data.type === "channel",
              });
            }
          });

        setTimeout(() => resolve(results), 500);
      });

      const searchResults = await searchPromise;
      return searchResults;
    } catch (error) {
      console.error("Errore ricerca canali:", error);
      setError("Errore nella ricerca dei canali");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Verifica se l'utente è il creatore del canale
  const isChannelCreator = useCallback((channel) => {
    return channel?.creator === user.is.pub;
  }, []);

  // Carica i canali all'avvio
  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  return {
    channelList,
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
