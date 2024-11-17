import { user, DAPP_NAME } from '../useGun.js';

/**
 * Deletes a todo item by its ID
 *
 * @async
 * @param {string} todoId - The ID of the todo to delete
 * @throws {Error} If user is not authenticated
 * @returns {Promise<void>}
 */
const deleteTodo = async (todoId) => {
  if (!user.is) throw new Error('User not authenticated');

  await user.get(DAPP_NAME).get('todos').get(todoId).put(null);
};

export default deleteTodo;
