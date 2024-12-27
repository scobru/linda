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

      console.log("Inizio caricamento canali e bacheche");

      // Carica prima la lista personale
      await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get("my_channels")
          .map()
          .on((data, key) => {
            if (data && data.channelId && key !== "_") {
              // Carica i dettagli del canale
              gun
                .get(DAPP_NAME)
                .get("channels")
                .get(data.channelId)
                .on((channelData) => {
                  if (channelData) {
                    const isBoard =
                      channelData.type === "board" || data.type === "board";

                    // Monitora i membri in tempo reale
                    gun
                      .get(DAPP_NAME)
                      .get("channels")
                      .get(data.channelId)
                      .get("members")
                      .on((members) => {
                        const membersCount = members
                          ? Object.keys(members).filter(
                              (key) => key !== "_" && members[key]
                            ).length
                          : 0;

                        channelMap.set(data.channelId, {
                          ...channelData,
                          id: data.channelId,
                          joined: true,
                          members: membersCount,
                          isChannel: !isBoard,
                          isBoard: isBoard,
                          name:
                            channelData.name ||
                            (isBoard
                              ? "Bacheca senza nome"
                              : "Canale senza nome"),
                          creator: channelData.creator,
                          created: channelData.created || Date.now(),
                          type: isBoard ? "board" : "channel",
                          messages: channelData.messages || {},
                          settings: {
                            isPublic: true,
                            canWrite: isBoard,
                            ...channelData.settings,
                          },
                        });

                        // Aggiorna la lista
                        const sortedChannels = Array.from(
                          channelMap.values()
                        ).sort((a, b) => b.created - a.created);
                        setChannelList(sortedChannels);
                      });
                  }
                });
            }
          });

        setTimeout(resolve, 2000);
      });

      setLoading(false);
    } catch (error) {
      console.error("Errore caricamento:", error);
      setError("Errore nel caricamento");
      toast.error("Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, []);

  // Crea un nuovo canale o bacheca
  const createChannel = useCallback(
    async (name, isChannel = true) => {
      if (!user.is) {
        toast.error("Devi essere autenticato per creare un canale");
        return;
      }

      try {
        const channelId = `channel_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        console.log("Iniziando creazione:", {
          channelId,
          name,
          isChannel,
          creator: user.is.pub,
        });

        // Struttura base semplificata
        const channelData = {
          id: channelId,
          name,
          type: isChannel ? "channel" : "board",
          creator: user.is.pub,
          created: Date.now(),
          members: { [user.is.pub]: true },
          membersCount: 1,
          isChannel,
          isBoard: !isChannel,
        };

        // Salvataggio diretto
        const channelNode = gun.get(DAPP_NAME).get("channels").get(channelId);
        channelNode.put(channelData);

        // Aggiungi alla lista personale
        const userChannelNode = gun
          .user()
          .get(DAPP_NAME)
          .get("my_channels")
          .get(channelId);
        userChannelNode.put({
          channelId,
          joined: Date.now(),
          type: isChannel ? "channel" : "board",
          isBoard: !isChannel,
        });

        // Aggiorna la lista locale immediatamente
        setChannelList((prev) => [
          {
            ...channelData,
            joined: true,
          },
          ...prev,
        ]);

        // Forza il ricaricamento dopo un breve ritardo
        setTimeout(() => {
          loadChannels();
          toast.success(
            `${isChannel ? "Canale" : "Bacheca"} creato con successo!`
          );
        }, 1000);

        return channelId;
      } catch (error) {
        console.error("Errore creazione:", error);
        toast.error("Errore nella creazione: " + error.message);
        throw error;
      }
    },
    [loadChannels]
  );

  // Entra in un canale
  const joinChannel = useCallback(
    async (channelId) => {
      try {
        setLoading(true);
        await new Promise((resolve, reject) => {
          // Monitora i membri in tempo reale
          gun
            .get(DAPP_NAME)
            .get("channels")
            .get(channelId)
            .get("members")
            .on((members) => {
              const currentMembers = members
                ? Object.keys(members).filter(
                    (key) => key !== "_" && members[key]
                  ).length
                : 0;

              // Aggiungi l'utente ai membri del canale
              gun
                .get(DAPP_NAME)
                .get("channels")
                .get(channelId)
                .get("members")
                .get(user.is.pub)
                .put(true, (ack) => {
                  if (ack.err) {
                    reject(new Error(ack.err));
                    return;
                  }

                  // Aggiungi il canale alla lista personale
                  gun
                    .user()
                    .get(DAPP_NAME)
                    .get("my_channels")
                    .get(channelId)
                    .put(
                      {
                        channelId,
                        joined: Date.now(),
                      },
                      (ack2) => {
                        if (ack2.err) {
                          reject(new Error(ack2.err));
                          return;
                        }
                        resolve();
                      }
                    );
                });
            });
        });

        toast.success("Iscrizione effettuata con successo!");

        // Aggiorna in background per sicurezza
        loadChannels();
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
        await new Promise((resolve, reject) => {
          // Monitora i membri in tempo reale
          gun
            .get(DAPP_NAME)
            .get("channels")
            .get(channelId)
            .get("members")
            .on((members) => {
              const currentMembers = members
                ? Object.keys(members).filter(
                    (key) => key !== "_" && members[key]
                  ).length
                : 0;

              // Rimuovi l'utente dai membri del canale
              gun
                .get(DAPP_NAME)
                .get("channels")
                .get(channelId)
                .get("members")
                .get(user.is.pub)
                .put(null, (ack) => {
                  if (ack.err) {
                    reject(new Error(ack.err));
                    return;
                  }

                  // Rimuovi il canale dalla lista personale
                  gun
                    .user()
                    .get(DAPP_NAME)
                    .get("my_channels")
                    .get(channelId)
                    .put(null, (ack2) => {
                      if (ack2.err) {
                        reject(new Error(ack2.err));
                        return;
                      }
                      resolve();
                    });
                });
            });
        });

        // Aggiorna immediatamente lo stato locale
        setChannelList((prevList) =>
          prevList.filter((channel) => channel.id !== channelId)
        );

        toast.success("Disiscrizione effettuata con successo!");

        // Aggiorna in background per sicurezza
        loadChannels();
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

        // Verifica che l'utente sia il creatore
        const channel = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("channels")
            .get(channelId)
            .once((data) => resolve(data));
        });

        if (!channel || channel.creator !== user.is.pub) {
          throw new Error("Non hai i permessi per eliminare questo canale");
        }

        await new Promise((resolve, reject) => {
          // Prima rimuovi tutti i membri
          gun
            .get(DAPP_NAME)
            .get("channels")
            .get(channelId)
            .get("members")
            .map()
            .once((member, key) => {
              if (member) {
                gun
                  .get(DAPP_NAME)
                  .get("channels")
                  .get(channelId)
                  .get("members")
                  .get(key)
                  .put(null);

                // Rimuovi anche dalla lista personale di ogni membro
                gun
                  .user(member)
                  .get(DAPP_NAME)
                  .get("my_channels")
                  .map()
                  .once((data, key) => {
                    if (data && data.channelId === channelId) {
                      gun
                        .user(member)
                        .get(DAPP_NAME)
                        .get("my_channels")
                        .get(key)
                        .put(null);
                    }
                  });
              }
            });

          // Poi elimina il canale
          gun
            .get(DAPP_NAME)
            .get("channels")
            .get(channelId)
            .put(null, (ack) => {
              if (ack.err) {
                reject(new Error(ack.err));
                return;
              }
              resolve();
            });
        });

        toast.success("Canale eliminato con successo!");
        await loadChannels();
        return true;
      } catch (error) {
        console.error("Errore eliminazione canale:", error);
        toast.error("Errore nell'eliminazione: " + error.message);
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

        // Aumentiamo il timeout per dare più tempo all'utente
        setTimeout(() => resolve(results), 2000);
      });

      const searchResults = await searchPromise;
      return searchResults.sort((a, b) => a.name.localeCompare(b.name));
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
