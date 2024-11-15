import { gun, DAPP_NAME } from '../../../state';

const deleteTodo = async (key) => {
  const dbTodos = gun.get(DAPP_NAME).get('todos');
  await dbTodos.get(key).put(null);
};

export default deleteTodo; 