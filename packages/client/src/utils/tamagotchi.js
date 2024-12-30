export const generateAIResponse = async (input) => {
  try {
    // Validazione input
    if (!input || typeof input !== "string") {
      throw new Error("Input non valido per la generazione della risposta");
    }

    // Prepara i parametri per la richiesta
    const params = {
      inputs: input,
      parameters: {
        max_new_tokens: 200,
        temperature: 0.7,
        top_p: 0.95,
        repetition_penalty: 1.15,
      },
    };

    // Effettua la chiamata con retry
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const response = await chat(params);

        if (response && response[0] && response[0].generated_text) {
          return response[0].generated_text;
        }

        throw new Error("Risposta non valida dall'API");
      } catch (error) {
        attempts++;

        if (attempts === maxAttempts) {
          throw error;
        }

        // Attendi prima di riprovare
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
      }
    }
  } catch (error) {
    console.error("Errore nella generazione della risposta AI:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    // Rilancia l'errore con un messaggio più descrittivo
    throw new Error(
      `Errore nella generazione della risposta AI: ${error.message}`
    );
  }
};
