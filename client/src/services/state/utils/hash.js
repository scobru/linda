/**
 * Generates a hash from a string
 * @param {string} string - String to generate hash from
 * @returns {string} Generated hash
 */
export function hash(string) {
  // Validazione base
  if (!string) {
    return '';
  }

  // Assicurati che sia una stringa
  string = String(string);

  // L'hash risultante
  let result = 0;

  // Per ogni lettera...
  string.split('').forEach(function (letter) {
    /*
      Trova il suo valore, randomizzalo,
      e salvalo nel risultato.
    */
    const char = letter.charCodeAt(0);
    result = (result << 5) - result + char;
    result &= result;
  });

  // Ritorna l'hash con un suffisso ':'
  return `${result.toString(36)}:`;
}
