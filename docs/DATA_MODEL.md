# 🗺️ Linda Data Model

Every piece of Linda state lives in the Zen graph. There is no SQL schema, no
REST API, and no server-side session: a "table" is a deterministic graph path,
and access control is signature plus certificate based.

This document is the map of those paths. It is the fastest way to understand
what the client actually reads and writes, and it is the reference to consult
before adding a new feature that needs storage.

## Notation

| Symbol | Meaning |
| :--- | :--- |
| `<pub>` | A user's secp256k1 public key (their identity). |
| `~<pub>/…` | User space: only the owner (or a certificate holder) can write. |
| `<name>/…` | Root space: world-writable unless a certificate policy narrows it. |
| `<roomId>` | `p2p_<pubLow>_<pubHigh>` for 1:1, or a UUID (36 chars, contains `-`) for groups. |

## 1. Identity & discovery

| Path | Space | Contents |
| :--- | :--- | :--- |
| `~<pub>/profile/uniqueUsername` | user | The owner's `@handle`. |
| `~<pub>/profile/…` | user | Nickname, avatar, and other profile fields. |
| `~<pub>/linda_bundle_v7/{epub,username,uniqueUsername}` | user | Public identity bundle. `epub` carries `pair.pub` for backwards compatibility with readers that expect a separate exchange key. |
| `~<pub>/linda_bundle_v8/inbox_cert` | user | The Zen certificate that authorises third parties to write into this user's inbox. |
| `linda_unique_usernames/<@handle>` | root | Handle → `pub`. The decentralised handle index; first writer wins. |
| `linda_pub_to_handle/<pub>` | root | Reverse lookup, `pub` → `@handle`. |
| `linda_pub_to_nickname/<pub>` | root | Reverse lookup, `pub` → display name. |
| `linda_aliases` | root | Legacy alias index, still read for older accounts. |

Profile resolution is intentionally redundant: `useProfile` queries several of
these paths in parallel and takes the first non-empty answer, because relays
converge at different speeds and a blank name is worse than a stale one.

## 2. Conversations

| Path | Space | Contents |
| :--- | :--- | :--- |
| `linda_rooms/<roomId>/meta` | root | Room descriptor: type, title, member list, group `secret` for legacy rooms. |
| `linda_rooms/<roomId>/messages` | root | Append-only message set. Values are ciphertext. |
| `linda_rooms/<roomId>/deleted_messages` | root | Tombstones for messages hidden from the room. |
| `linda_rooms/<roomId>/pins` | root | Pinned message ids. |
| `linda_rooms/<roomId>/reactions/<messageId>::<pub>` | root | One reactor's emoji on one message, or `null` once cleared. One leaf per (message, member) pair so concurrent reactors never overwrite each other. |
| `linda_room_keys/<roomId>` | root | Encrypted escrow of a room secret, readable only by the members who hold the wrapping key. |

The 1:1 room id is derived, not negotiated: both peers sort their two public
keys and build `p2p_<pubLow>_<pubHigh>`. Two clients that have never exchanged
a packet still agree on where to write.

Message bodies are always ciphertext at rest. A relay operator reading
`linda_rooms/*/messages` sees three base62 segments (`ciphertext.iv.tag`) and
routing metadata, never plaintext.

## 3. Inboxes and signalling

| Path | Space | Contents |
| :--- | :--- | :--- |
| `linda_v3_inbox_<pub>` | root | Public "poke" inbox. Tells a client that a room has new traffic so it can subscribe. |
| `~<pub>/linda_inbox_v13/msgs` | user + cert | Certificate-gated inbox. Peers write here using the certificate published in `linda_bundle_v8`. |
| `linda_v3_contacts_<pub>` | root | The owner's contact list and per-contact state. |
| `linda_v2_typing_<pub>` | root | Ephemeral typing indicator. |

Two inbox generations coexist on purpose. `linda_v3_inbox_<pub>` is a root node
that anyone can write to without a certificate, which makes first contact
possible; `~<pub>/linda_inbox_v13/msgs` is the certificate-gated path used once
the sender holds the recipient's certificate. New code should write to the
certified path and fall back to the public one.

> **Certified writes address the leaf.** When writing into a certified room or
> inbox path, both the read and the write must address the leaf soul directly.
> Chaining down from a parent node with a certificate attached silently stalls
> instead of erroring.

## 4. Group secrets

A group's AES-GCM key never travels in the clear and is never derivable from the
room id.

- The creator generates a 256-bit key and keeps it in `secretCache` plus
  `localStorage` under `linda_group_secret_<myPub>_<groupId>`.
- The same key is escrowed, encrypted to the owner's own keypair, at
  `linda_room_keys/<groupId>`. This is what survives a cleared browser profile.
- New members receive the key through a 1:1 ECDH-encrypted invite message, not
  through the group room itself.

A key is only accepted if it decodes as base64 of a 16, 24, or 32 byte buffer.
Anything else is refused rather than cached, because a corrupt secret poisons
every later send in the room.

## 5. Local (non-graph) state

`localStorage` holds cache and convenience state only. Losing it costs speed and
possibly unescrowed group keys, never identity.

| Key | Purpose |
| :--- | :--- |
| `linda_pub`, `linda_alias`, `linda_user_nick` | Cached identity for instant first paint. |
| `linda_user_unique_username`, `linda_unique_username` | Cached `@handle`. |
| `linda_group_secret_<myPub>_<groupId>` | Group key cache, backed by graph escrow. |
| `linda-theme` | Selected DaisyUI theme. |

## Adding a new path

Three rules keep the graph navigable:

1. **Version the namespace.** The `_v3`/`v13` suffixes exist because changing a
   node's shape in place breaks every client still reading the old shape.
2. **Derive ids, don't negotiate them.** If both parties can compute the path
   from public information, you avoid an entire class of rendezvous bugs.
3. **Encrypt before writing, never after.** The graph is public infrastructure;
   treat every root path as if a stranger is reading it, because one is.

## See also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how these paths fit together at runtime.
- [../ENCRYPTION_FLOW.md](../ENCRYPTION_FLOW.md) — the cryptography, in Italian.
