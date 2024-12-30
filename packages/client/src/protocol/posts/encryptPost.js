import { encrypt } from '../crypto/index.js';

/**
 * Encrypts a post's content using the provided token.
 *
 * @async
 * @function encryptPost
 * @param {string} post - The post content to encrypt
 * @param {string} token - The encryption token used to encrypt the post content
 * @returns {Promise<string>} A promise that resolves to the encrypted post text
 * @throws {Error} Throws error if encryption fails
 *
 * @description
 * This function encrypts a post's content using the following steps:
 * 1. Takes the post content as input
 * 2. Encrypts it using the provided token
 * 3. Returns the encrypted text
 *
 * @example
 * // Encrypt a post
 * const encryptedText = await encryptPost(
 *   "My secret message",
 *   "encryption-token-123"
 * );
 * console.log(`Encrypted text: ${encryptedText}`);
 */
const encryptPost = async (post, token) => {
  console.log('Encrypting Post');
  const text = await encrypt(post, token);
  return text;
};

export default encryptPost;
