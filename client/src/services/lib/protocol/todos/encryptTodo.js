import { encrypt } from '../../crypto';

const encryptTodo = async (todo, token) => {
  const text = await encrypt(todo, token);
  return text;
};

export default encryptTodo; 