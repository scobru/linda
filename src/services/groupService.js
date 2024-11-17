export const createGroup = async ({ name, creator, members }) => {
  try {
    const response = await fetch('http://localhost:3001/api/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        creator,
        members
      })
    });

    if (!response.ok) {
      throw new Error('Errore nella creazione del gruppo');
    }

    return await response.json();
  } catch (error) {
    console.error('Errore durante la creazione del gruppo:', error);
    throw error;
  }
}; 