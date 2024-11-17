import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Updates an existing todo item
 *
 * @async
 * @param {string} todoId - The ID of the todo to update
 * @param {Object} updates - Object containing the fields to update
 * @throws {Error} If user is not authenticated
 * @throws {Error} If todo is not found
 * @throws {Error} If user is not the author of the todo
 * @returns {Promise<void>}
 */
const updateTodo = async (todoId, updates) => {
  if (!user.is) throw new Error('User not authenticated');

  const todo = await new Promise((resolve) => {
    user
      .get(DAPP_NAME)
      .get('todos')
      .get(todoId)
      .once((todo) => resolve(todo));
  });

  if (!todo) throw new Error('Todo not found');
  if (todo.author !== user.is.pub) throw new Error('Not authorized');

  const updatedTodo = {
    ...todo,
    ...updates,
    lastUpdated: Date.now(),
  };

  await user.get(DAPP_NAME).get('todos').get(todoId).put(updatedTodo);
};

export default updateTodo;
