import { gun, user, DAPP_NAME } from '../useGun.js';

export const boards = {
  create: async (boardData) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const boardId = `board_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const board = {
        ...boardData,
        id: boardId,
        creator: user.is.pub,
        created: Date.now(),
        members: { [user.is.pub]: true },
      };

      await gun.get(DAPP_NAME).get('boards').get(boardId).put(board);
      return { success: true, boardId };
    } catch (error) {
      console.error('Error creating board:', error);
      throw error;
    }
  },

  join: async (boardId) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get(boardId)
        .get('members')
        .get(user.is.pub)
        .put(true);
      return { success: true };
    } catch (error) {
      console.error('Error joining board:', error);
      throw error;
    }
  },

  leave: async (boardId) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get(boardId)
        .get('members')
        .get(user.is.pub)
        .put(null);
      return { success: true };
    } catch (error) {
      console.error('Error leaving board:', error);
      throw error;
    }
  },

  delete: async (boardId) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('boards')
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board || board.creator !== user.is.pub) {
        throw new Error('Not authorized to delete this board');
      }

      await gun.get(DAPP_NAME).get('boards').get(boardId).put(null);
      return { success: true };
    } catch (error) {
      console.error('Error deleting board:', error);
      throw error;
    }
  },

  update: async (boardId, updates) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const board = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('boards')
          .get(boardId)
          .once((data) => resolve(data));
      });

      if (!board || board.creator !== user.is.pub) {
        throw new Error('Not authorized to update this board');
      }

      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get(boardId)
        .put({
          ...board,
          ...updates,
          lastUpdated: Date.now(),
        });

      return { success: true };
    } catch (error) {
      console.error('Error updating board:', error);
      throw error;
    }
  },
};
