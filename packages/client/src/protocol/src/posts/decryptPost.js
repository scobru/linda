import { decrypt } from '../crypto/index.js';
import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Decrypts an encrypted post's content using the provided token.
 *
 * @async
 * @function decryptPost
 * @param {object} post - The encrypted post content to decrypt
 * @param {string} token - The decryption token used to decrypt the post content
 * @returns {Promise<string>} A promise that resolves to the decrypted post text
 * @throws {Error} If user is not authenticated
 * @throws {Error} If decryption fails
 *
 * @description
 * This function handles decryption of encrypted post content by:
 * 1. Verifying that a user is authenticated
 * 2. Using the provided token to decrypt the post content
 * 3. Returning the decrypted text or throwing an error if decryption fails
 *
 * The function requires user authentication to ensure only authorized users can decrypt posts.
 * It uses the decrypt utility from the crypto module to perform the actual decryption.
 *
 * @example
 * try {
 *   const encryptedPost = {
 *     content: "encrypted-content-here",
 *     // ... other post metadata
 *   };
 *
 *   const decryptedText = await decryptPost(
 *     encryptedPost,
 *     "decryption-token-123"
 *   );
 *   console.log("Decrypted post:", decryptedText);
 * } catch (error) {
 *   console.error("Failed to decrypt:", error.message);
 * }
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
