import { gun, user } from '../../../state';
import { createMessagesCertificate } from '../security';
import { messageNotifications } from '../notifications';
import SEA from 'gun/sea';

const sendMessage = async (chatId, recipientPub, content, callback = () => {}) => {
  console.log('Sending message:', { chatId, recipientPub, content });

  if (!user.is) {
    console.error('User not authenticated');
    return callback({
      success: false,
      errMessage: 'User not authenticated'
    });
  }

  try {
    // Verifica se la chat esiste
    const chat = await new Promise((resolve) => {
      gun.get('chats')
        .get(chatId)
        .once(chat => resolve(chat));
    });

    if (!chat) {
      console.error('Chat not found');
      return callback({
        success: false,
        errMessage: 'Chat non trovata'
      });
    }

    // Crea un ID univoco per il messaggio
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('Generated message ID:', messageId);

    const recipientEpub = await new Promise((resolve) => {
      gun.user(recipientPub).once((data) => {
        resolve(data.epub);
      });
    });

    // Cripta il contenuto del messaggio usando la chiave esistente
    const secret = await SEA.secret(recipientEpub, user.pair());
    const encryptedContent = await SEA.encrypt(content, secret);

    console.log('Generated secret for encryption:', { 
      recipientPub, 
      ourPub: user.is.pub,
      secret 
    });

    console.log('Encryption result:', {
      originalContent: content,
      encryptedContent
    });

    if (!encryptedContent) {
      throw new Error('Encryption failed');
    }

    // Rimuovi i log sensibili
    console.log('Message encrypted successfully');

    // Cripta l'anteprima usando la stessa chiave ma con un flag
    const previewContent = content.substring(0, 50) + (content.length > 50 ? '...' : '');
    const encryptedPreview = await SEA.encrypt(previewContent, secret);

    // Prepara i dati del messaggio
    const messageData = {
      sender: user.is.pub,
      recipient: recipientPub,
      timestamp: Date.now(),
      senderAlias: user.is.alias || 'Unknown',
      id: messageId,
      status: 'pending',
      content: encryptedContent,
      preview: encryptedPreview,
      version: '2.0'
    };

    // Inizializza il tracciamento del messaggio
    await messageNotifications.initMessageTracking(messageId, chatId);

    // Salva il messaggio
    await new Promise((resolve, reject) => {
      gun.get('chats')
        .get(chatId)
        .get('messages')
        .get(messageId)
        .put(messageData, (ack) => {
          if (ack.err) {
            console.error('Error saving message:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('Message saved successfully');
            resolve();
          }
        });
    });

    // Aggiorna lastMessage usando l'anteprima criptata
    gun.get('chats')
      .get(chatId)
      .get('lastMessage')
      .put({
        content: encryptedPreview,
        sender: user.is.pub,
        timestamp: Date.now(),
        version: '2.0'
      });

    console.log('Message sent successfully:', messageId);
    
    return callback({
      success: true,
      messageId,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Error sending message:', error);
    return callback({
      success: false,
      errMessage: error.message || 'Error sending message'
    });
  }
};

export default sendMessage;
