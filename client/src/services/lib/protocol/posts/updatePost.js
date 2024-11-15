import { gun } from '../../../state';
import encryptPost from './encryptPost';
import { DAPP_NAME } from '../../../state';
/**
 * Updates an existing post with new encrypted content
 * @param {string} key The key of the post to update
 * @param {object} post The updated post object
 * @param {string} token The encryption token
 * @returns {Promise<void>} A promise that resolves when the post is updated
 */
const updatePost = async (key, post, token) => {
  const encrypted = await encryptPost(post, token);

  await gun.get(DAPP_NAME)
           .get('posts')
           .get(key)
           .put({
             ...encrypted,
             updatedAt: Date.now(),
             encrypted: true
           });
};

export default updatePost;
