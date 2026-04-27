## 2026-04-27 - Low Entropy in Wormhole Codes
**Vulnerability:** Wormhole encryption codes were using `Math.random()` and had only 10,000 possible combinations (10 adjectives * 10 nouns * 100 numbers). This made the E2E encryption of files shared via Wormhole vulnerable to trivial brute-force attacks.
**Learning:** Even with strong algorithms like AES-GCM and PBKDF2, the overall security is limited by the entropy of the input secret/code.
**Prevention:** Use `crypto.getRandomValues()` for all security-sensitive random generation and ensure the search space for human-readable codes is sufficiently large (at least millions of combinations for short-lived transfers).
