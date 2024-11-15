import { gun } from '../../../state';
import decryptPost from './decryptPost';
import { DAPP_NAME } from '../../../state';

/**
 * Retrieves and decrypts a post by its key.
 *
 * @async
 * @function getPost
 * @param {string} key - The unique key identifier of the post to retrieve
 * @param {string} token - The decryption token used to decrypt the post content
 * @returns {Promise<object|null>} A promise that resolves to the decrypted post object or null if not found
 * @throws {Error} Throws error if decryption fails
 *
 * @description
 * This function retrieves a post from the gun database and decrypts its content using the provided token.
 * If the post is not found, it returns null.
 *
 * @example
 * // Get and decrypt a post
 * const post = await getPost("post-123", "decryption-token-123");
 * if (post) {
 *   console.log("Post content:", post);
 * }
 */
export const getPost = async (key, token) => {
  const dbPosts = gun.get(DAPP_NAME).get('posts');

  const post = await dbPosts.get(key).then();
  if (post) {
    return await decryptPost(post, token);
  }
  return null;
};

/**
 * Retrieves and decrypts all posts from the system.
 *
 * @async
 * @function getAllPosts
 * @param {string} token - The decryption token used to decrypt encrypted posts
 * @returns {Promise<Array>} A promise that resolves to an array of decrypted post objects
 * @throws {Error} Throws error if processing or decryption fails
 *
 * @description
 * This function retrieves all posts from the gun database and processes them as follows:
 * 1. For encrypted posts, attempts to decrypt the content using the provided token
 * 2. For unencrypted posts, includes them as-is
 * 3. Skips invalid or unreadable posts
 * Each post object in the returned array contains:
 * - id: The unique post identifier
 * - text: The post content (decrypted if encrypted)
 * - author: The post author's identifier
 * - createdAt: Post creation timestamp
 * - encrypted: Boolean flag indicating if post was encrypted
 *
 * @example
 * // Get all posts
 * const posts = await getAllPosts("decryption-token-123");
 * posts.forEach(post => {
 *   console.log(`Post ${post.id} by ${post.author}: ${post.text}`);
 * });
 */
export const getAllPosts = async (token) => {
  console.log('getAllPosts - token:', token);

  const dbPosts = gun.get(DAPP_NAME).get('posts');

  return new Promise((resolve) => {
    const posts = [];
    let completed = false;

    dbPosts.map().once(async (data, key) => {
      if (!data) return;

      try {
        console.log('Processando post:', key);

        // Se il post è criptato
        if (data.encrypted && data.text) {
          try {
            const decryptedText = await decryptPost(data.text, token);
            if (decryptedText) {
              posts.push({
                id: key,
                text: decryptedText,
                author: data.author,
                createdAt: data.createdAt,
                encrypted: true,
              });
            }
          } catch (decryptError) {
            console.warn(`Errore decifratura post ${key}:`, decryptError);
          }
        }
        // Se il post non è criptato
        else if (data.text) {
          posts.push({
            id: key,
            text: data.text,
            author: data.author,
            createdAt: data.createdAt,
            encrypted: false,
          });
        }

        // Risolvi la promise dopo un breve delay per assicurarsi che tutti i post siano processati
        if (!completed) {
          completed = true;
          setTimeout(() => resolve(posts), 100);
        }
      } catch (err) {
        console.error(`Errore processando post ${key}:`, err);
      }
    });

    // Fallback nel caso non ci siano post
    setTimeout(() => {
      if (!completed) {
        completed = true;
        resolve(posts);
      }
    }, 1000);
  });
};
