const HF_API_KEY_STORAGE_KEY = "hf_api_key";

export const apiKeyService = {
  getHuggingFaceKey: () => {
    return localStorage.getItem(HF_API_KEY_STORAGE_KEY);
  },

  setHuggingFaceKey: (apiKey) => {
    localStorage.setItem(HF_API_KEY_STORAGE_KEY, apiKey);
  },

  hasValidHuggingFaceKey: () => {
    const key = localStorage.getItem(HF_API_KEY_STORAGE_KEY);
    return key && key.startsWith("hf_");
  },

  validateHuggingFaceKey: async (apiKey) => {
    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/gpt2",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: "test" }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("Errore validazione chiave Hugging Face:", error);
      return false;
    }
  },

  clearHuggingFaceKey: () => {
    localStorage.removeItem(HF_API_KEY_STORAGE_KEY);
  },
};
