import { gun } from '../../../state';
import { user } from '../../../state';
import { DAPP_NAME } from '../../../state';

/**
 * Updates an existing note in the system, either public or private.
 *
 * @async
 * @function updateNote
 * @param {string} hash - The unique hash identifier of the note to update
 * @param {string} title - The new title for the note
 * @param {string} author - The new author name/identifier for the note
 * @param {string} content - The new content/body for the note
 * @param {boolean} isPublic - Flag indicating if note is public (true) or private (false)
 * @param {string} [verification=''] - Optional verification data for public notes
 * @returns {Promise<void>} A promise that resolves when the note is updated
 * @throws {Error} Throws error if attempting to update private note without authentication
 *
 * @description
 * This function updates an existing note with new data. For private notes,
 * the content is encrypted before storage. All input is sanitized using DOMPurify.
 * The lastUpdated timestamp is automatically set to the current time.
 *
 * @example
 * // Update a public note
 * await updateNote(
 *   "abc123",
 *   "Updated Title",
 *   "John Doe",
 *   "New content",
 *   true
 * );
 *
 * // Update a private note
 * await updateNote(
 *   "xyz789",
 *   "Private Note Update",
 *   "John Doe",
 *   "New secret content",
 *   false
 * );
 */
const updateNote = async (
  hash,
  title,
  author,
  content,
  isPublic,
  verification = ''
) => {
  console.log(
    'updateNote',
    hash,
    title,
    author,
    content,
    isPublic,
    verification
  );
  // Verifica autenticazione per note private
  if (!isPublic && !user.is) {
    throw new Error('Authentication required for private notes');
  }

  const noteData = {
    title: title,
    author: author,
    content: content,
    verification: isPublic ? verification : '',
    lastUpdated: new Date().toISOString(),
    isPublic,
  };

  try {
    if (isPublic) {
      //gun.get('gun-eth').get('public-notes').get(hash).put(noteData);

      await gun.get(DAPP_NAME).get('public-notes').get(hash).put(noteData);
    } else {
      // Per note private, cripta il contenuto
      await user.get(DAPP_NAME)
               .get('private-notes')
               .get(hash)
               .put(noteData);
    }
  } catch (error) {
    throw new Error(`Failed to update note: ${error.message}`);
  }
};

export default updateNote;
