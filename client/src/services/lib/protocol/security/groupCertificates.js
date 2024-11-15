import { gun, user } from '../../../state';

export const createGroupCertificate = async (groupId, memberPub) => {
  if (!user.is) throw new Error('User not authenticated');

  // Crea un certificato per il membro che gli permette di:
  // 1. Leggere i messaggi del gruppo
  // 2. Inviare messaggi (se non è un canale)
  // 3. Accedere alle informazioni del gruppo
  const certificate = await gun.user().certificate({
    pub: memberPub,
    epub: memberPub,
    alias: 'group-member',
    groupId: groupId,
    // Definisci i permessi specifici
    'can-read': true,
    'can-write': true,
    'can-list': true
  });

  // Salva il certificato
  await gun.get('groups')
    .get(groupId)
    .get('certificates')
    .get(memberPub)
    .put(certificate);

  return certificate;
}; 