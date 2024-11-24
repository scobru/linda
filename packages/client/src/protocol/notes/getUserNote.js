import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Carica le note da una collezione specifica
 * @param {object} collection - Collezione Gun
 * @param {boolean} isPublic - Flag per note pubbliche/private
 * @returns {Promise<Array>} Array di note
 */
const loadNotes = (collection, isPublic) => {
  return new Promise((resolve) => {
    const notes = [];
    let found = false;

    collection.map().once((data, id) => {
      if (!data || id === '_') return;
      found = true;

      try {
        const noteData = typeof data === 'string' ? JSON.parse(data) : data;
        notes.push({
          ...noteData,
          id,
          isPublic,
        });
      } catch (error) {
        console.error(
          `Errore parsing nota ${isPublic ? 'pubblica' : 'privata'}:`,
          error
        );
      }
    });

    // Risolvi dopo un timeout se non vengono trovate note
    setTimeout(() => {
      if (!found) {
        console.log(
          `Nessuna nota ${isPublic ? 'pubblica' : 'privata'} trovata`
        );
      }
      resolve(notes);
    }, 1000);
  });
};

/**
 * Recupera tutte le note dell'utente
 * @returns {Promise<Array>} Array di note filtrate
 */
const getUserNotes = async () => {
  if (!user?._.sea) {
    throw new Error('Utente non autenticato');
  }

  try {
    // Carica note pubbliche e private in parallelo
    const [publicNotes, privateNotes] = await Promise.all([
      loadNotes(gun.get(DAPP_NAME).get('public-notes'), true),
      loadNotes(user.get(DAPP_NAME).get('private-notes'), false),
    ]);

    // Combina e filtra le note
    return [...publicNotes, ...privateNotes]
      .filter((note) => note.content && note.title)
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  } catch (error) {
    console.error('Errore caricamento note:', error);
    throw error;
  }
};

export default getUserNotes;
