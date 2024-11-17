import groups from '../../../protocol/src/messaging/groups';

// ...

const handleCreate = async (groupData) => {
  try {
    if (!groupData.name.trim()) {
      throw new Error('Il nome del gruppo non può essere vuoto');
    }

    const newGroup = await groups.createGroup(
      groupData.name.trim(), 
      'group' // tipo di gruppo
    );

    console.log('Gruppo creato con successo:', newGroup);
    
  } catch (error) {
    console.error('Errore durante la creazione del gruppo:', error);
    // Qui puoi aggiungere la gestione degli errori (es. mostrare un messaggio all'utente)
  }
};

// ... 