/**
 * @typedef {Object} CacheManager
 * @descrizione Gestore della cache migliorato per memorizzazione temporanea dei dati
 * @proprietà {Map} store - Archivio dei dati in cache
 * @proprietà {number} ttl - Tempo di vita predefinito in millisecondi
 */

/**
 * @tipo {CacheManager}
 * @descrizione Istanza del gestore cache
 */
export const cacheManager = {
  store: new Map(),
  ttl: 5 * 60 * 1000, // 5 minuti

  /**
   * @metodo get
   * @asincrono
   * @param {string} key - Chiave dell'elemento da recuperare
   * @restituisce {Promise<*>} Il valore memorizzato o null se non trovato/scaduto
   */
  async get(key) {
    const cached = this.store.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.value;
    }
    return null;
  },

  /**
   * @metodo set
   * @param {string} key - Chiave per memorizzare il valore
   * @param {*} value - Valore da memorizzare
   * @param {number} [customTtl] - TTL personalizzato in millisecondi
   */
  set(key, value, customTtl = null) {
    this.store.set(key, {
      value,
      timestamp: Date.now(),
      ttl: customTtl || this.ttl,
    });
  },

  /**
   * @metodo delete
   * @param {string} key - Chiave dell'elemento da eliminare
   */
  delete(key) {
    this.store.delete(key);
  },

  /**
   * @metodo clear
   * @descrizione Rimuove tutti gli elementi dalla cache
   */
  clear() {
    this.store.clear();
  },

  /**
   * @metodo cleanup
   * @descrizione Rimuove automaticamente le entry scadute
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.store.delete(key);
      }
    }
  },
};

// Avvia pulizia cache periodica
if (typeof window !== 'undefined') {
  setInterval(() => cacheManager.cleanup(), 60000);
} 