/**
 * Firma un'attività ActivityPub usando una chiave privata RSA
 * @param {Object} activity - L'attività da firmare
 * @param {string} privateKey - La chiave privata RSA in formato PEM
 * @returns {Object} L'attività firmata
 */
export const signActivity = async (activity, privateKey) => {
  try {
    // Creiamo una copia dell'attività senza la firma
    const { signature: existingSignature, ...activityWithoutSignature } = activity;
    
    // Convertiamo l'attività in una stringa JSON canonicalizzata
    const canonicalString = JSON.stringify(activityWithoutSignature);
    
    // Convertiamo la stringa in un ArrayBuffer
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    
    // Importiamo la chiave privata
    const keyData = await importPrivateKey(privateKey);
    
    // Firmiamo i dati
    const signatureBuffer = await window.crypto.subtle.sign(
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" },
      },
      keyData,
      data
    );
    
    // Convertiamo la firma in base64
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signatureValue = btoa(String.fromCharCode.apply(null, signatureArray));
    
    // Aggiungiamo la firma all'attività
    return {
      ...activity,
      signature: {
        type: 'RsaSignature2017',
        creator: `${activity.actor}#main-key`,
        signatureValue: signatureValue,
        created: new Date().toISOString()
      }
    };
  } catch (error) {
    throw new Error(`Errore durante la firma dell'attività: ${error.message}`);
  }
};

/**
 * Verifica la firma di un'attività ActivityPub
 * @param {Object} activity - L'attività da verificare
 * @param {string} publicKey - La chiave pubblica RSA in formato PEM
 * @returns {boolean} true se la firma è valida
 */
export const verifyActivity = async (activity, publicKey) => {
  try {
    if (!activity.signature || !activity.signature.signatureValue) {
      return false;
    }

    // Estraiamo la firma e creiamo una copia dell'attività senza di essa
    const { signature, ...activityWithoutSignature } = activity;
    
    // Convertiamo l'attività in una stringa JSON canonicalizzata
    const canonicalString = JSON.stringify(activityWithoutSignature);
    
    // Convertiamo la stringa in un ArrayBuffer
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalString);
    
    // Decodifichiamo la firma da base64
    const signatureArray = Uint8Array.from(atob(signature.signatureValue), c => c.charCodeAt(0));
    
    // Importiamo la chiave pubblica
    const keyData = await importPublicKey(publicKey);
    
    // Verifichiamo la firma
    return await window.crypto.subtle.verify(
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" },
      },
      keyData,
      signatureArray,
      data
    );
  } catch (error) {
    console.error('Errore durante la verifica della firma:', error);
    return false;
  }
};

// Funzione helper per importare una chiave privata PEM
async function importPrivateKey(pem) {
  // Rimuoviamo header, footer e newlines
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  // Decodifichiamo da base64
  const binaryDer = window.atob(pemContents);
  const derArray = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    derArray[i] = binaryDer.charCodeAt(i);
  }
  
  // Importiamo la chiave
  return await window.crypto.subtle.importKey(
    'pkcs8',
    derArray,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );
}

// Funzione helper per importare una chiave pubblica PEM
async function importPublicKey(pem) {
  // Rimuoviamo header, footer e newlines
  const pemContents = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');
  
  // Decodifichiamo da base64
  const binaryDer = window.atob(pemContents);
  const derArray = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    derArray[i] = binaryDer.charCodeAt(i);
  }
  
  // Importiamo la chiave
  return await window.crypto.subtle.importKey(
    'spki',
    derArray,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['verify']
  );
}

/**
 * Recupera la chiave pubblica di un attore ActivityPub
 * @param {string} actorUrl - L'URL dell'attore
 * @returns {Promise<string>} La chiave pubblica in formato PEM
 */
export const fetchActorPublicKey = async (actorUrl) => {
  try {
    const response = await fetch(actorUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const actor = await response.json();
    if (!actor.publicKey || !actor.publicKey.publicKeyPem) {
      throw new Error('Chiave pubblica non trovata nell\'attore');
    }
    
    return actor.publicKey.publicKeyPem;
  } catch (error) {
    throw new Error(`Errore nel recupero della chiave pubblica: ${error.message}`);
  }
}; 