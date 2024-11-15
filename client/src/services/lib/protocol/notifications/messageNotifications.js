import { gun, user } from '../../../state';

const messageNotifications = {
  // Inizializza il tracciamento di un messaggio
  initMessageTracking: async (messageId, chatId) => {
    if (!user.is || !messageId || !chatId) return;

    // Salva lo stato iniziale del messaggio
    await gun.get('chats')
      .get(chatId)
      .get('messages')
      .get(messageId)
      .get('status')
      .put({
        sent: true,
        delivered: false,
        read: false,
        timestamp: Date.now()
      });
  },

  // Invia notifica di consegna
  sendDeliveryReceipt: async (messageId, chatId, senderPub) => {
    if (!user.is || !messageId || !chatId || !senderPub) return;
    
    console.log('Sending delivery receipt:', { messageId, chatId, senderPub });

    const receipt = {
      type: 'delivery',
      messageId,
      timestamp: Date.now(),
      from: user.is.pub,
      to: senderPub
    };

    // Salva la ricevuta nel nodo dei messaggi
    await gun.get('chats')
      .get(chatId)
      .get('messages')
      .get(messageId)
      .get('receipts')
      .set(receipt);

    // Aggiorna lo stato del messaggio
    await gun.get('chats')
      .get(chatId)
      .get('messages')
      .get(messageId)
      .get('status')
      .put({
        delivered: true,
        timestamp: Date.now()
      });
  },

  // Invia notifica di lettura
  sendReadReceipt: async (messageId, chatId, senderPub) => {
    if (!user.is || !messageId || !chatId || !senderPub) return;
    
    console.log('Sending read receipt:', { messageId, chatId, senderPub });

    const receipt = {
      type: 'read',
      messageId,
      timestamp: Date.now(),
      from: user.is.pub,
      to: senderPub
    };

    // Salva la ricevuta nel nodo dei messaggi
    await gun.get('chats')
      .get(chatId)
      .get('messages')
      .get(messageId)
      .get('receipts')
      .set(receipt);

    // Aggiorna lo stato del messaggio
    await gun.get('chats')
      .get(chatId)
      .get('messages')
      .get(messageId)
      .get('status')
      .put({
        delivered: true,
        read: true,
        timestamp: Date.now()
      });
  },

  // Sottoscrizione alle notifiche per un messaggio
  subscribeToReceipts: (messageId, chatId, callback) => {
    if (!messageId || !chatId || !callback) return;

    console.log('Setting up receipt subscription:', { messageId, chatId });

    // Sottoscrivi alle ricevute
    const receiptUnsub = gun.get('chats')
      .get(chatId)
      .get('messages')
      .get(messageId)
      .get('receipts')
      .map()
      .on((receipt) => {
        if (!receipt) return;
        console.log('Received receipt:', receipt);
        callback(receipt);
      });

    // Sottoscrivi allo stato del messaggio
    const statusUnsub = gun.get('chats')
      .get(chatId)
      .get('messages')
      .get(messageId)
      .get('status')
      .on((status) => {
        if (!status) return;
        console.log('Received status update:', status);
        callback({ type: 'status', status });
      });

    // Ritorna una funzione per cancellare entrambe le sottoscrizioni
    return () => {
      console.log('Cleaning up receipt subscriptions');
      if (typeof receiptUnsub === 'function') receiptUnsub();
      if (typeof statusUnsub === 'function') statusUnsub();
    };
  },

  // Ottieni lo stato corrente di un messaggio
  getMessageState: async (messageId, chatId) => {
    return new Promise((resolve) => {
      gun.get('chats')
        .get(chatId)
        .get('messages')
        .get(messageId)
        .get('status')
        .once((status) => {
          console.log('Current message state:', { messageId, status });
          resolve(status || {
            sent: true,
            delivered: false,
            read: false
          });
        });
    });
  }
};

export default messageNotifications; 