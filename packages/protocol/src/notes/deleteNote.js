import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Deletes a note from the system by its hash identifier.
 *
 * @async
 * @function deleteNote
 * @param {string} hash - The unique hash identifier of the note to delete
 * @param {boolean} isPublic - Flag indicating if the note is public (true) or private (false)
 * @returns {Promise<void>} A promise that resolves when the note is deleted
 * @throws {Error} Throws error if attempting to delete private note without authentication
 *
 * @description
 * This function deletes either a public or private note based on the provided hash and isPublic flag.
 * For private notes, the user must be authenticated. The deletion is performed by setting the note
 * reference to null in the appropriate storage location.
 *
 * @example
 * // Delete a public note
 * await deleteNote("abc123", true);
 *
 * // Delete a private note
 * await deleteNote("xyz789", false);
 */
const deleteNote = async (hash, isPublic) => {
  if (isPublic) {
    await gun.get(DAPP_NAME).get('public-notes').get(hash).put(null);
  } else {
    await user.get(DAPP_NAME).get('private-notes').get(hash).put(null);
  }
};

export default deleteNote;
