// Funzione per bloccare una chat
const blockChat = async (chatId) => {
  return new Promise((resolve) => {
    gun.get(DAPP_NAME)
      .get('blocked_chats')
      .get(chatId)
      .put({ blocked: true, timestamp: Date.now() }, (ack) => {
        resolve({ success: !ack.err });
      });
  });
};

// Funzione per sbloccare una chat
const unblockChat = async (chatId) => {
  return new Promise((resolve) => {
    gun.get(DAPP_NAME)
      .get('blocked_chats')
      .get(chatId)
      .put(null, (ack) => {
        resolve({ success: !ack.err });
      });
  });
};

// Funzione per ottenere le chat bloccate
const getBlockedChats = async () => {
  return new Promise((resolve) => {
    const blockedChats = [];
    gun.get(DAPP_NAME)
      .get('blocked_chats')
      .map()
      .once((data, id) => {
        if (data && data.blocked) {
          blockedChats.push(id);
        }
      });
    
    setTimeout(() => resolve(blockedChats), 500);
  });
};

export const chat = {
  // ... altre funzioni esistenti ...
  blockChat,
  unblockChat,
  getBlockedChats
}; 