import { gun, user, SEA, DAPP_NAME } from "../useGun.js";

/**
 * Servizio per la gestione delle note condivise
 */
export const sharedNotes = {
  /**
   * Crea una nota condivisa e la registra sul relay
   * @param {string} title - Titolo della nota
   * @param {string} content - Contenuto della nota
   * @param {string} password - Password per la crittografia
   * @returns {Promise<{noteId: string, shareUrl: string}>} ID della nota e URL di condivisione
   */
  createSharedNote: async (title, content, password) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      console.log("📝 Creazione nota condivisa...");

      // Genera un ID univoco per la nota
      const noteId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Prepara i dati della nota
      const noteData = {
        title,
        content,
        author: user.is.pub,
        createdAt: Date.now(),
        type: "shared",
      };

      // Cripta i dati con la password
      const secret = await SEA.work(password, null, null, { name: "SHA-256" });
      const encryptedData = await SEA.encrypt(JSON.stringify(noteData), secret);

      console.log("🔐 Nota crittografata");

      // Salva la nota nel nodo pubblico
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("shared-notes")
          .get(noteId)
          .put(
            {
              data: encryptedData,
              relay: true, // Flag per il relay
            },
            (ack) => {
              if (ack.err) {
                console.error("❌ Errore salvataggio nota:", ack.err);
                reject(new Error(ack.err));
              } else {
                console.log("✅ Nota salvata sul nodo pubblico");
                resolve();
              }
            }
          );
      });

      // Registra la nota sul relay
      await new Promise((resolve, reject) => {
        gun
          .get("relay")
          .get("notes")
          .get(noteId)
          .put(
            {
              timestamp: Date.now(),
              author: user.is.pub,
            },
            (ack) => {
              if (ack.err) {
                console.error("❌ Errore registrazione su relay:", ack.err);
                reject(new Error(ack.err));
              } else {
                console.log("✅ Nota registrata sul relay");
                resolve();
              }
            }
          );
      });

      // Genera l'URL di condivisione
      const shareUrl = `${window.location.origin}/shared-note/${noteId}#${password}`;

      return {
        noteId,
        shareUrl,
      };
    } catch (error) {
      console.error("❌ Errore creazione nota condivisa:", error);
      throw new Error("Impossibile creare la nota condivisa");
    }
  },

  /**
   * Recupera una nota condivisa
   * @param {string} noteId - ID della nota
   * @param {string} password - Password per la decrittazione
   * @returns {Promise<Object>} Dati della nota decriptati
   */
  getSharedNote: async (noteId, password) => {
    try {
      console.log("🔍 Recupero nota condivisa...");

      // Verifica se la nota è registrata sul relay
      const relayData = await new Promise((resolve) => {
        gun
          .get("relay")
          .get("notes")
          .get(noteId)
          .once((data) => {
            console.log("📡 Dati relay:", data);
            resolve(data);
          });
      });

      if (!relayData) {
        console.error("❌ Nota non trovata sul relay");
        throw new Error("Nota non trovata");
      }

      // Recupera la nota dal nodo pubblico
      const encryptedNote = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("shared-notes")
          .get(noteId)
          .once((data) => {
            console.log("📦 Nota crittografata recuperata");
            resolve(data?.data);
          });
      });

      if (!encryptedNote) {
        console.error("❌ Dati nota non trovati");
        throw new Error("Dati nota non trovati");
      }

      // Decripta i dati
      const secret = await SEA.work(password, null, null, { name: "SHA-256" });
      const decryptedData = await SEA.decrypt(encryptedNote, secret);

      if (!decryptedData) {
        console.error("❌ Errore decrittazione: password errata");
        throw new Error("Password non valida");
      }

      console.log("✅ Nota decriptata con successo");
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error("❌ Errore recupero nota condivisa:", error);
      throw error;
    }
  },

  /**
   * Verifica se una nota è disponibile sul relay
   * @param {string} noteId - ID della nota
   * @returns {Promise<boolean>} True se la nota è disponibile
   */
  checkNoteAvailability: async (noteId) => {
    try {
      const relayData = await new Promise((resolve) => {
        gun
          .get("relay")
          .get("notes")
          .get(noteId)
          .once((data) => resolve(data));
      });

      return !!relayData;
    } catch (error) {
      console.error("❌ Errore verifica disponibilità nota:", error);
      return false;
    }
  },
};

export default sharedNotes;
