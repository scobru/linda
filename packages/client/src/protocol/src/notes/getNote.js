import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Retrieves a note by its hash.
 *
 * @async
 * @function getNote
 * @param {string} hash - Note identifier
 * @returns {Promise<Note>} Note object
 * @throws {Error} If note not found
 */
const getNote = async (hash) => {
  // First try public notes
  const publicNote = await new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('public-notes')
      .get(hash)
      .once((note) => resolve(note));
  });

  if (publicNote) {
    return {
      ...publicNote,
      id: hash,
      isPrivate: false,
    };
  }

  // Then try private notes (if user is authenticated)
  if (user.is) {
    const privateNote = await new Promise((resolve) => {
      user
        .get(DAPP_NAME)
        .get('private-notes')
        .get(hash)
        .once((note) => resolve(note));
    });

    if (privateNote) {
      return {
        ...privateNote,
        id: hash,
        isPrivate: true,
      };
    }
  }

  throw new Error('Note not found');
};

export default getNote;
