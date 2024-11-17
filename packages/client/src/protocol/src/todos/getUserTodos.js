import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Retrieves all todos for the currently authenticated user
 *
 * @async
 * @function getUserTodos
 * @returns {Promise<Array>} Array of todo objects sorted by creation date (newest first)
 * @throws {Error} If user is not authenticated
 * @description
 * Each todo object contains:
 * - id: Unique identifier
 * - title: Todo title
 * - description: Todo description
 * - dueDate: Due date (ISO string)
 * - priority: Priority level (high/medium/low)
 * - status: Current status
 * - created: Creation timestamp
 * - lastUpdated: Last update timestamp
 * - author: Public key of creator
 */
const getUserTodos = async () => {
  if (!user.is) throw new Error('User not authenticated');

  return new Promise((resolve) => {
    const todos = [];
    user
      .get(DAPP_NAME)
      .get('todos')
      .map()
      .once((todo, id) => {
        if (todo && !todo._ && id !== '_') {
          todos.push({
            ...todo,
            id,
          });
        }
      });

    setTimeout(() => {
      resolve(todos.sort((a, b) => b.created - a.created));
    }, 500);
  });
};

export default getUserTodos;
