const handleClearChat = async () => {
  try {
    console.log('Messaggi da cancellare:', messages.length);

    // Usa la funzione del messageList per cancellare i messaggi
    const success = await messageList.clearChatMessages(activeChat.roomId);

    if (success) {
      // Aggiorna lo stato locale
      updateMessages([]);
      toast.success('Chat cancellata con successo');
    } else {
      toast.error('Errore durante la cancellazione della chat');
    }
  } catch (error) {
    console.error('Errore durante la cancellazione della chat:', error);
    toast.error('Errore durante la cancellazione della chat');
  }
};
