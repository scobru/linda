import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Gets all notes for the current user.
 *
 * @async
 * @function getUserNotes
 * @returns {Promise<Array<Note>>} Array of user's notes
 * @throws {Error} If user is not authenticated
 */
const getUserNotes = async () => {
  if (!user.is) {
    throw new Error('User not authenticated');
  }

  return new Promise((resolve) => {
    const notes = [];

    // Get private notes
    user
      .get(DAPP_NAME)
      .get('private-notes')
      .map()
      .once((note, id) => {
        if (note && !note._ && id !== '_') {
          notes.push({
            ...note,
            id,
            isPrivate: true,
          });
        }
      });

    // Get public notes
    gun
      .get(DAPP_NAME)
      .get('public-notes')
      .map()
      .once((note, id) => {
        if (note && note.author === user.is.pub && !note._ && id !== '_') {
          notes.push({
            ...note,
            id,
            isPrivate: false,
          });
        }
      });

    // Wait a bit to collect all notes
    setTimeout(() => {
      resolve(
        notes.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))
      );
    }, 500);
  });
};

export default getUserNotes;
