# 🛡️ Security Model

This document states what Linda protects, what it does not, and where the
current implementation falls short of its own design. It is written to be useful
to someone deciding whether to trust the app, which means the limitations
section matters more than the guarantees section.

## What Linda guarantees

- **End-to-end encryption of message content.** 1:1 messages are encrypted with
  AES-GCM under a key derived by ECDH between the two participants' secp256k1
  keys. Group messages use a shared 256-bit AES-GCM key distributed only over
  encrypted 1:1 channels.
- **No server-side account database.** Identity is a keypair derived
  deterministically from username and password. There is no account to
  compromise, no password hash to leak, and no operator who can reset access.
- **Authenticated writes.** Every graph node is signed. A relay cannot forge a
  message from a user whose private key it does not hold.
- **Blind relays.** Relays replicate ciphertext and validate signatures. They
  hold no keys and perform no decryption.
- **Scoped write certificates.** Inbox writes are authorised per peer rather
  than by a wildcard policy, so one leaked certificate authorises one writer on
  one path.

## What Linda does not protect against

- **Metadata exposure.** A relay operator sees which souls are written, at what
  time, and by which public key. `linda_rooms/p2p_<pubA>_<pubB>` is a
  world-readable path whose name identifies both participants. **Who talks to
  whom, and when, is not hidden.**
- **A compromised endpoint.** Keys live in the browser or app profile. Malware,
  a malicious extension, or physical device access defeats the entire model.
- **A weak password.** Because the keypair is derived from username and
  password, an attacker who guesses both derives your private key directly and
  can read everything you have ever sent. There is no rate limit to hide behind,
  and no server to lock the account. This is the single largest practical risk
  in the design.
- **Compromised delivery of the web app.** The static bundle is served from a
  host. Whoever controls that host controls the code that handles your keys.
  Desktop and Android builds narrow, but do not eliminate, this exposure.
- **Forward secrecy in 1:1 chats.** Those secrets are derived from long-term
  identity keys with no ratchet. If a private key leaks, every past message that
  a relay or observer archived becomes readable. Signal-style forward secrecy is
  not implemented. Group chats are different: their key rotates on removal, so
  the exposure there is bounded by the epoch rather than by the lifetime of the
  identity.
- **Group history from before you joined — and from after you left.** Kicking or
  leaving rotates the group key, and the departing member is not given the new
  one, so they lose access from that point on. What they already received stays
  readable to them: rotation revokes future access, and cannot reach backwards
  into messages already delivered. A kick that cannot rotate fails outright, so
  it never silently leaves the old key in force; leaving a group rotates on a
  best-effort basis, because failing to rotate must not trap someone in a group
  they asked to leave.

## Implementation notes worth knowing

- **`VITE_AUTH_TOKEN` is required for file transfer.** It gates the Wormhole
  relay, and the client refuses to send when it is unset rather than fall back
  to a token published in this repo. Deployments that relied on the old
  `shogun2025` default must now set the variable explicitly.
- **The relay list is hard-coded** to a single public relay in `src/App.tsx`.
  That is one operator with a full view of all traffic metadata for default
  installs, and one point of failure for availability.
- **Legacy Gun SEA payloads (`SEA{…}`) are rejected, not decrypted.** This is
  deliberate: it avoids a downgrade path to the older format.
- **Group keys are validated before caching.** Anything that is not base64 of a
  16, 24, or 32 byte buffer is refused, so a corrupt key cannot poison later
  sends.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository rather than a public
issue. Include the affected component, reproduction steps, and the commit you
tested against.

## See also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the pieces fit together.
- [DATA_MODEL.md](./DATA_MODEL.md) — exactly what is stored where.
- [../ENCRYPTION_FLOW.md](../ENCRYPTION_FLOW.md) — the cryptographic detail, in Italian.
