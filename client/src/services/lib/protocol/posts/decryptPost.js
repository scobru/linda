import { decrypt } from '../../crypto';
import { user } from '../../../state';

/**
 * Decrypts an encrypted post's content using the provided token.
 *
 * @async
 * @function decryptPost
 * @param {object} post - The encrypted post content to decrypt
 * @param {string} token - The decryption token used to decrypt the post content
 * @returns {Promise<string>} A promise that resolves to the decrypted post text
 * @throws {Error} Throws error if user is not authenticated or if decryption fails
 *
 * @description
 * This function decrypts an encrypted post's content using the following steps:
 * 1. Verifies user authentication
 * 2. Attempts to decrypt the post content using the provided token
 * 3. Returns the decrypted text if successful
 *
 * @example
 * // Decrypt a post
 * const decryptedText = await decryptPost(
 *   encryptedPostContent,
 *   "decryption-token-123"
 * );
 * console.log(`Decrypted text: ${decryptedText}`);
 */
const decryptPost = async (post, token) => {
  if (!user.is) {
    throw new Error('User must be authenticated to decrypt posts');
  }

  try {
    const decryptedText = await decrypt(post, token);
    return decryptedText;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Could not decrypt post');
  }
};

export default decryptPost;
