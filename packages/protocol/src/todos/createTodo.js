import { user, DAPP_NAME } from '../useGun.js';

/**
 * Creates a new todo item.
 *
 * @async
 * @function createTodo
 * @param {string} title - Todo title
 * @param {string} description - Todo description
 * @param {Date} dueDate - Due date for the todo
 * @param {string} priority - Priority level (high, medium, low)
 * @returns {Promise<string>} Todo identifier
 * @throws {Error} If user not authenticated
 */
const createTodo = async (title, description, dueDate, priority = 'medium') => {
  if (!user.is) {
    throw new Error('User not authenticated');
  }

  const todoId = `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const todoData = {
    id: todoId,
    title,
    description,
    dueDate: dueDate?.toISOString(),
    priority,
    status: 'pending',
    created: Date.now(),
    lastUpdated: Date.now(),
    author: user.is.pub,
  };

  await user.get(DAPP_NAME).get('todos').get(todoId).put(todoData);

  return todoId;
};

export default createTodo;
