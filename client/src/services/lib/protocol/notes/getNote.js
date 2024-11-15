import { gun, user } from '../../../state';

/**
 * Retrieves a note from the system by its hash identifier.
 *
 * @async
 * @function getNote
 * @param {string} hash - The unique hash identifier of the note to retrieve
 * @returns {Promise<object|null>} A promise that resolves to:
 *   - The note object if found (decrypted if private)
 *   - null if no note exists with the given hash
 * @throws {Error} Throws error if attempting to access private note without authentication
 *
 * @description
 * This function attempts to retrieve a note using its hash identifier. It first checks
 * for a public note, and if not found, attempts to retrieve a private note if the user
 * is authenticated. Private notes are automatically decrypted before being returned.
 *
 * @example
 * // Get a note
 * const note = await getNote("abc123");
 * if (note) {
 *   console.log(note.title);
 * } else {
 *   console.log("Note not found");
 * }
 */
const getNote = async (hash) => {
  const publicNote = await gun
    .get('gun-eth')
    .get('public-notes')
    .get(hash)
    .then();
  if (publicNote) {
    return JSON.parse(publicNote);
  }

  if (!user.is) {
    throw new Error(
      "L'utente deve essere autenticato per accedere alle note private"
    );
  }

  const privateNote = await user
    .get('gun-eth')
    .get('private-notes')
    .get(hash)
    .then();
  if (privateNote) {
    return JSON.parse(privateNote);
  }

  return null;
};

export default getNote;
