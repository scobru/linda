/**
 * @module sendMessage
 * @description Module for sending encrypted messages between users
 */

import { gun, user, DAPP_NAME } from '../useGun.js';
import { messageNotifications } from '../notifications/index.js';
import messageList from './messageList.js';
import { blocking } from '../index.js';
import { updateGlobalMetrics } from '../system/systemService.js';
import { certificateManager } from '../security/index.js';

const { userBlocking } = blocking;

/**
 * Sends an encrypted message to a recipient in a chat
 * @async
 * @param {string} chatId - The ID of the chat where the message will be sent
 * @param {string} recipientPub - The public key of the message recipient
 * @param {string} content - The message content to be encrypted and sent
 * @param {Function} [callback] - Optional callback function to handle the result
 * @returns {Promise<Object>} Object containing success status and message details
 * @throws {Error} If user is not authenticated or encryption fails
 */
const sendMessage = async (
  chatId,
  recipientPub,
  content,
  callback = () => {}
) => {
  console.log('Sending message:', { chatId, recipientPub, content });

  if (!user.is) {
    console.error('User not authenticated');
    return callback({
      success: false,
      errMessage: 'User not authenticated',
    });
  }

  try {
    // Verifica lo stato di blocco
    const blockStatus = await userBlocking.getBlockStatus(recipientPub);
    if (blockStatus.blocked) {
      console.error('Utente bloccato');
      throw new Error('Non puoi inviare messaggi a un utente che hai bloccato');
    }
    if (blockStatus.blockedBy) {
      console.error("Bloccato dall'utente");
      throw new Error(
        'Non puoi inviare messaggi a un utente che ti ha bloccato'
      );
    }

    // Recupera i certificati necessari
    console.log('Recupero certificati per:', {
      recipientPub,
      myPub: user.is.pub,
      paths: {
        myChat: `private_certificates/chats/${recipientPub}`,
        myMessage: `private_certificates/messages/${recipientPub}`,
        theirChat: `certificates/chats/${user.is.pub}`,
        theirMessage: `certificates/messages/${user.is.pub}`,
      },
    });

    const [myChatCert, myMessageCert, theirChatCert, theirMessageCert] =
      await Promise.all([
        // I miei certificati (pubblici)
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('chats')
            .get(user.is.pub)
            .once((cert) => {
              console.log('Recuperato mio certificato chat:', cert);
              resolve(cert);
            });
        }),
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('messages')
            .get(user.is.pub)
            .once((cert) => {
              console.log('Recuperato mio certificato messaggi:', cert);
              resolve(cert);
            });
        }),
        // I loro certificati (pubblici)
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('chats')
            .get(recipientPub)
            .once((cert) => {
              console.log('Recuperato loro certificato chat:', cert);
              resolve(cert);
            });
        }),
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('messages')
            .get(recipientPub)
            .once((cert) => {
              console.log('Recuperato loro certificato messaggi:', cert);
              resolve(cert);
            });
        }),
      ]);

    if (!myChatCert || !myMessageCert) {
      console.error('Certificati mancanti:', { myChatCert, myMessageCert });
      throw new Error(
        'Non hai i permessi per inviare messaggi a questo utente'
      );
    }

    if (!theirChatCert || !theirMessageCert) {
      console.error("L'altro utente ha revocato i permessi:", {
        theirChatCert,
        theirMessageCert,
      });
      throw new Error("L'altro utente ha revocato i permessi per questa chat");
    }

    // Verifica la validità dei certificati
    const [
      isMyChatCertValid,
      isMyMessageCertValid,
      isTheirChatCertValid,
      isTheirMessageCertValid,
    ] = await Promise.all([
      certificateManager.verifyCertificate(myChatCert, user.is.pub, 'chats'),
      certificateManager.verifyCertificate(
        myMessageCert,
        user.is.pub,
        'messages'
      ),
      certificateManager.verifyCertificate(
        theirChatCert,
        recipientPub,
        'chats'
      ),
      certificateManager.verifyCertificate(
        theirMessageCert,
        recipientPub,
        'messages'
      ),
    ]);

    if (!isMyChatCertValid || !isMyMessageCertValid) {
      console.error('I tuoi certificati non sono validi:', {
        isMyChatCertValid,
        isMyMessageCertValid,
        myChatCert,
        myMessageCert,
      });
      throw new Error('I tuoi permessi per questa chat sono stati revocati');
    }

    if (!isTheirChatCertValid || !isTheirMessageCertValid) {
      console.error("I certificati dell'altro utente non sono validi:", {
        isTheirChatCertValid,
        isTheirMessageCertValid,
        theirChatCert,
        theirMessageCert,
      });
      throw new Error("L'altro utente ha revocato i permessi per questa chat");
    }

    // Verifica se la chat esiste
    const chat = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .once((chat) => resolve(chat));
    });

    if (!chat) {
      console.error('Chat non trovata');
      return callback({
        success: false,
        errMessage: 'Chat non trovata',
      });
    }

    // Verifica lo stato della chat
    if (chat.status === 'removed') {
      console.error('Chat rimossa');
      return callback({
        success: false,
        errMessage: 'Questa chat è stata rimossa',
      });
    }

    // Verifica se la chat è bloccata
    const isBlocked = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('blocked_chats')
        .get(chatId)
        .once((data) => resolve(!!data?.blocked));
    });

    if (isBlocked) {
      console.error('Chat bloccata');
      return callback({
        success: false,
        errMessage: 'Questa chat è stata bloccata',
      });
    }

    // Crea un ID univoco per il messaggio
    const messageId = `msg_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    console.log('Generated message ID:', messageId);

    // Usa la funzione di crittografia da messageList
    const encryptedContent = await messageList.encryptMessage(
      content,
      recipientPub
    );
    console.log('Message encrypted successfully');

    // Cripta l'anteprima
    const previewContent =
      content.substring(0, 50) + (content.length > 50 ? '...' : '');
    const encryptedPreview = await messageList.encryptMessage(
      previewContent,
      recipientPub
    );

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
      version: '2.0',
    };

    // Inizializza il tracciamento del messaggio
    await messageNotifications.initMessageTracking(messageId, chatId);

    // Salva il messaggio
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('chats')
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
    gun.get(DAPP_NAME).get('chats').get(chatId).get('lastMessage').put({
      content: encryptedPreview,
      sender: user.is.pub,
      timestamp: Date.now(),
      version: '2.0',
    });

    console.log('Message sent successfully:', messageId);

    // Incrementa il contatore dei messaggi inviati
    updateGlobalMetrics('totalMessagesSent', 1);

    return callback({
      success: true,
      messageId,
      message: 'Message sent successfully',
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return callback({
      success: false,
      errMessage: error.message || 'Error sending message',
    });
  }
};

export default sendMessage;
