import { decrypt } from '../crypto/index.js';
import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Decrypts a todo item using the provided token
 *
 * @async
 * @param {Object} todo - The encrypted todo object to decrypt
 * @param {string} token - The decryption token/key
 * @returns {Promise<Object>} The decrypted todo object
 * @throws {Error} If user is not authenticated
 * @throws {Error} If decryption fails
 */
const decryptTodo = async (todo, token) => {
  if (!user.is) {
    throw new Error('Utente deve essere autenticato per decifrare i todos');
  }

  try {
    const decryptedText = await decrypt(todo, token);
    return decryptedText;
  } catch (error) {
    console.error('Errore di decifratura:', error);
    throw new Error('Impossibile decifrare il todo');
  }
};

export default decryptTodo;
