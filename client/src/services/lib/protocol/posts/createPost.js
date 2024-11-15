import { gun, user, DAPP_NAME } from '../../../state';
import encryptPost from './encryptPost';

/**
 * Creates a new encrypted post in the system.
 *
 * @async
 * @function createPost
 * @param {string} content - The content of the post to be encrypted and stored
 * @param {string} token - The encryption token used to encrypt the post content
 * @returns {Promise<string>} A promise that resolves to the unique key identifier of the created post
 * @throws {Error} Throws error if user is not authenticated or if post creation fails
 *
 * @description
 * This function creates a new encrypted post with the following steps:
 * 1. Verifies user authentication
 * 2. Generates a timestamp-based key
 * 3. Encrypts the post content using the provided token
 * 4. Creates a post object with encrypted content and metadata
 * 5. Saves the post to the gun database
 *
 * @example
 * // Create a new encrypted post
 * const postKey = await createPost(
 *   "My secret message",
 *   "encryption-token-123"
 * );
 * console.log(`Post created with key: ${postKey}`);
 */
const createPost = async (content, token) => {
  if (!user.is) {
    throw new Error('User must be authenticated to create a post');
  }

  try {
    const key = Date.now().toString();
    const encryptText = await encryptPost(content, token);

    console.log('EncryptText', encryptText);

    const post = {
      text: encryptText,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      author: user.is.pub,
      encrypted: true,
    };

    gun.get(DAPP_NAME)
             .get('posts')
             .get(key)
             .put(post);
             
    return key;
  } catch (error) {
    console.error('Error creating post:', error);
    throw new Error(`Failed to create post: ${error.message}`);
  }
};

export default createPost;
