deriveStealthAddress(
  sharedSecret,
  receiverSpendingKey,
  senderEphemeralKey,
  receiverViewingKey
) {
  try {
    // Funzione migliorata per convertire base64 in hex
    const base64ToHex = (base64) => {
      try {
        if (typeof base64 !== 'string') {
          console.error("Input non valido:", base64);
          throw new Error("Input deve essere una stringa base64");
        }

        // Rimuovi il punto e prendi la prima parte
        const parts = base64.split(".");
        const cleanBase64 = parts[0];

        // Sostituisci i caratteri speciali di base64url con base64 standard
        const standardBase64 = cleanBase64
          .replace(/-/g, "+")
          .replace(/_/g, "/");

        // Aggiungi il padding se necessario
        const padding = "=".repeat((4 - (standardBase64.length % 4)) % 4);
        const paddedBase64 = standardBase64 + padding;

        // Decodifica base64 in binario
        const raw = atob(paddedBase64);

        // Converti binario in hex
        let hex = "";
        for (let i = 0; i < raw.length; i++) {
          const hexByte = raw.charCodeAt(i).toString(16).padStart(2, "0");
          hex += hexByte;
        }

        return "0x" + hex;
      } catch (error) {
        console.error("Errore nella conversione base64 a hex:", error);
        throw new Error(
          `Impossibile convertire la chiave da base64 a hex: ${error.message}`
        );
      }
    };

    console.log("Converting inputs to hex:", {
      sharedSecret,
      receiverSpendingKey,
      senderEphemeralKey,
      receiverViewingKey
    });

    // Converti tutti i valori in hex
    const sharedSecretHex = base64ToHex(sharedSecret);
    const receiverSpendingKeyHex = base64ToHex(receiverSpendingKey);
    const senderEphemeralKeyHex = base64ToHex(senderEphemeralKey);
    const receiverViewingKeyHex = base64ToHex(receiverViewingKey);

    // ... resto del codice ...
  } catch (error) {
    console.error("Errore nella derivazione dell'indirizzo stealth:", error);
    throw new Error(
      `Impossibile derivare l'indirizzo stealth: ${error.message}`
    );
  }
} 