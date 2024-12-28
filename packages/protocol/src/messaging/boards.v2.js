import { gun, user, DAPP_NAME } from '../useGun.js';

export const boardsV2 = {
  /**
   * Crea una nuova board
   */
  create: async (boardData, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const boardId = `board_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const board = {
        id: boardId,
        name: boardData.name,
        description: boardData.description,
        creator: user.is.pub,
        created: Date.now(),
        members: {},
        posts: {},
        type: boardData.type || 'public',
        category: boardData.category || 'general',
      };

      await gun.get(DAPP_NAME).get('boards').get(boardId).put(board);

      // Aggiungi il creatore come primo membro
      await gun.get(DAPP_NAME).get('boards').get(boardId).get('members').set({
        pub: user.is.pub,
        role: 'admin',
        joined: Date.now(),
      });

      return callback({ success: true, board });
    } catch (error) {
      console.error('Errore creazione board:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Unisciti a una board
   */
  join: async (boardId, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('boards')
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board) throw new Error('Board non trovata');
      if (board.type === 'private') throw new Error('Board privata');

      await gun.get(DAPP_NAME).get('boards').get(boardId).get('members').set({
        pub: user.is.pub,
        role: 'member',
        joined: Date.now(),
      });

      return callback({ success: true });
    } catch (error) {
      console.error('Errore partecipazione alla board:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Lista tutte le boards pubbliche
   */
  list: async (callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const boards = [];

      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('boards')
          .map()
          .once((board, id) => {
            if (board && board.type === 'public') {
              boards.push({ ...board, id });
            }
          });

        // Diamo un po' di tempo per raccogliere i risultati
        setTimeout(resolve, 1000);
      });

      return callback({ success: true, boards });
    } catch (error) {
      console.error('Errore lista boards:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Crea un nuovo post in una board
   */
  createPost: async (boardId, postData, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const postId = `post_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const post = {
        id: postId,
        title: postData.title,
        content: postData.content,
        creator: user.is.pub,
        created: Date.now(),
        comments: {},
        likes: 0,
      };

      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get(boardId)
        .get('posts')
        .get(postId)
        .put(post);

      return callback({ success: true, post });
    } catch (error) {
      console.error('Errore creazione post:', error);
      return callback({ success: false, error: error.message });
    }
  },
};
