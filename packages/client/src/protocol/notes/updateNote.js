import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Updates an existing note.
 *
 * @async
 * @function updateNote
 * @param {string} hash - Note identifier
 * @param {string} title - New title
 * @param {string} content - New content
 * @param {boolean} isPublic - Note visibility
 * @returns {Promise<void>}
 * @throws {Error} If note not found or user not authorized
 */
const updateNote = async (hash, title, content, isPublic) => {
  if (!user.is) {
    throw new Error('User not authenticated');
  }

  const note = await new Promise((resolve) => {
    (isPublic ? gun : user)
      .get(DAPP_NAME)
      .get(isPublic ? 'public-notes' : 'private-notes')
      .get(hash)
      .once((note) => resolve(note));
  });

  if (!note) {
    throw new Error('Note not found');
  }

  if (note.author !== user.is.pub) {
    throw new Error('Not authorized to update this note');
  }

  const updatedNote = {
    ...note,
    title,
    content,
    lastUpdated: new Date().toISOString(),
  };

  await (isPublic ? gun : user)
    .get(DAPP_NAME)
    .get(isPublic ? 'public-notes' : 'private-notes')
    .get(hash)
    .put(updatedNote);
};

export default updateNote;
