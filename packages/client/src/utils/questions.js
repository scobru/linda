// Funzione per validare i parametri della richiesta
const validateRequestParams = (params) => {
  if (!params || typeof params !== "object") {
    throw new Error("Parametri non validi");
  }

  if (!params.inputs || typeof params.inputs !== "string") {
    throw new Error("Input non valido");
  }

  return true;
};

export const chat = async (params) => {
  try {
    // Valida i parametri
    validateRequestParams(params);

    // Configura la richiesta
    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      },
      body: JSON.stringify(params),
    };

    // Effettua la chiamata con gestione timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      "https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta",
      {
        ...requestOptions,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Gestione errori HTTP
    if (!response.ok) {
      console.error("Errore API:", {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Errore HTTP! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // Log dettagliato dell'errore
    console.error("Errore durante la chat:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    // Rilancia l'errore con un messaggio più descrittivo
    throw new Error(`Errore durante la chat: ${error.message}`);
  }
};
