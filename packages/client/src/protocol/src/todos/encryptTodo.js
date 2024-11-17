import { encrypt } from '../crypto/index.js';

/**
 * Encrypts a todo item using the provided token
 *
 * @async
 * @param {Object} todo - The todo object to encrypt
 * @param {string} token - The encryption token/key
 * @returns {Promise<string>} The encrypted todo text
 * @throws {Error} If encryption fails
 */
const encryptTodo = async (todo, token) => {
  const text = await encrypt(todo, token);
  return text;
};

export default encryptTodo;
