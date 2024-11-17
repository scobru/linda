import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Recupera un todo tramite il suo ID
 *
 * @async
 * @param {string} todoId - L'ID del todo da recuperare
 * @returns {Promise<Object>} Il todo richiesto
 * @throws {Error} Se l'utente non è autenticato
 * @throws {Error} Se il todo non viene trovato
 */
const getTodo = async (todoId) => {
  if (!user.is) throw new Error('User not authenticated');

  const todo = await new Promise((resolve) => {
    user
      .get(DAPP_NAME)
      .get('todos')
      .get(todoId)
      .once((todo) => resolve(todo));
  });

  if (!todo) throw new Error('Todo not found');
  return todo;
};

export default getTodo;
