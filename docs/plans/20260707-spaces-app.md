# Spaces — an Anytype-like knowledge base on linda/ZEN

**Status:** Plan / Approved direction
**Date:** 2026-07-07
**Depends on:** ZEN Spaces/ACL layer (`scobru/zen` → `docs/plans/20260707-spaces-acl.md`)

---

## 1. Vision

Extend linda from a messaging app into a **local-first, E2E-encrypted,
collaborative knowledge base** — the Anytype model (objects, types, relations,
sets, shared spaces) running on ZEN's graph instead of any-sync, reusing
linda's existing identity, services, and relay infrastructure.

MVP scope decision: **shared Spaces from day one** (invites, roles, read-key
rotation are in the critical path, not deferred).

## 2. Feature mapping (Anytype → this app)

| Anytype concept | Implementation here |
|---|---|
| Identity / vault | Existing linda auth (ZEN pair, @handles) |
| Space (private/shared) | `ZEN.space.*` (zen M0–M3) + `SpaceService.ts` |
| Roles: Owner/Editor/Viewer | ACL chain roles (owner/admin/editor/viewer) |
| E2E encryption per space | Space read key (AES-GCM), sealed per member via ECDH; optional TPRE mode via existing `ThresholdService` |
| Object (page, note, task…) | Soul `space/<sid>/obj/<oid>`, encrypted value |
| Type | An object with `type: "type"` — types are objects, like Anytype |
| Relation | An object with `type: "relation"`; values stored on objects as `rel/<relId>` |
| Set / Collection | Saved query object; evaluated client-side over local index |
| Block editor | React block editor; one graph node per block; **LWW per block**; ordering via fractional index keys |
| Sync / backup nodes | ZEN mesh + linda relay (`simple-relay.js`), IndexedDB local-first |
| Files | Existing `FileTransferService` (WebRTC) + Wormhole for async |

## 3. Architecture

### Reused as-is
- **Auth & identity**: current ZEN pair + @handle discovery
- **`ThresholdService`** (Umbral TPRE): optional space encryption mode, mirroring `GroupService`'s existing `symmetric | tpre` split
- **`FileTransferService` / `WormholeService`**: attachments
- **Relay** (`simple-relay.js`, `Dockerfile.relay`): sync backbone; later runs the ACL finalization watcher

### New modules (`src/services`, `src/spaces`)

```
src/services/SpaceService.ts     — wraps ZEN.space.* (create/invite/join/grant/revoke/put/get)
src/services/ObjectService.ts    — objects, types, relations, sets; local index; backlinks
src/spaces/editor/               — block editor (paragraph, heading, todo, list, code, mention)
src/spaces/components/           — SpaceSidebar, ObjectList, TypeManager, MemberManager
src/pages/SpacePage.tsx          — main space view (router: /space/:sid, /space/:sid/o/:oid)
src/pages/SpaceSettingsPage.tsx  — members, roles, invites, key rotation status
```

### Data model detail

- **Object**: `{ oid, type, name, icon, rel: {...}, blocks: {...}, createdBy, t }`
  encrypted as a whole per-block, not per-object, so concurrent edits to
  different blocks merge via HAM.
- **Block**: `space/<sid>/obj/<oid>/blk/<bid>` → `{ kind, text, props, ord }`.
  `ord` is a fractional-index string (e.g. `"a0" < "a0V" < "a1"`), so reordering
  never rewrites siblings and concurrent inserts merge without a sequence CRDT.
  Conflict granularity = one block (LWW). Accepted trade-off for MVP; per-char
  merge is out of scope.
- **Index**: `ObjectService` maintains an in-memory index (by type, by relation,
  full-text) hydrated from IndexedDB at startup; Sets evaluate against it.
- **Backlinks**: mentions write a reverse edge `obj/<target>/backlinks/<source>`.

## 4. Phases

### Fase 0 — Protocol dependency (zen repo, blocking)
- [ ] zen M0–M1 (ACL chain + keyring) — see zen plan
- [ ] **Switch dependency** `package.json`: `"zen": "github:akaoio/zen"` → `scobru/zen` fork carrying the Spaces layer (or upstream if merged)
- [ ] Extend `src/zen/zen.d.ts` + `src/zen/db.ts` typings for `ZEN.space.*`

### Fase 1 — SpaceService + minimal objects (2–3 weeks)
- [ ] `SpaceService.ts`: create/open space, member roster, pending-vs-final ACL state surfaced to UI
- [ ] `ObjectService.ts`: CRUD objects with 3 built-in types (Page, Note, Task), encrypted via space read key
- [ ] IndexedDB persistence + startup hydration
- [ ] Unit tests alongside `src/__tests__`

**Accettazione:** two devices, same identity, create/edit objects offline → converge on reconnect; all payloads encrypted on the wire and at the relay.

### Fase 2 — Block editor (2–3 weeks)
- [ ] Block components: paragraph, heading ×3, todo, bulleted/numbered list, code, divider, mention
- [ ] Fractional-index ordering, keyboard model (enter/backspace/tab), slash menu
- [ ] Per-block save → `ObjectService`; concurrent edit of different blocks by two users converges

**Accettazione:** two members edit different blocks of the same page simultaneously; no lost writes; block reorder while offline merges cleanly.

### Fase 3 — Sharing & roles (2 weeks, the MVP differentiator)
- [ ] Invite flow UI: generate invite link (QR via existing `qrcode.react`), join request, admin approval
- [ ] `MemberManager`: grant/revoke roles; show "pending until finalized (T)" state honestly
- [ ] Key rotation on revoke, keyring handling in client; revoked member verifiably loses access to new writes
- [ ] Optional TPRE mode toggle at space creation (reuse `GroupService` pattern)

**Accettazione:** Owner invites Editor and Viewer; Editor writes, Viewer reads but cannot write (PEN rejects); revoke Editor → rotation → ex-Editor cannot decrypt anything written after.

### Fase 4 — Types, relations, sets, graph (2–3 weeks)
- [ ] `TypeManager`: user-defined types with relation schemas
- [ ] Relations: text, number, date, checkbox, object-link
- [ ] Sets: saved queries (filter by type/relation) with table view
- [ ] Backlinks panel; simple graph view (nodes = objects, edges = links/relations)
- [ ] Attachments via `FileTransferService`/Wormhole

### Fase 5 — Hardening
- [ ] ACL finalization watcher on relay (zen M2)
- [ ] E2E tests (Playwright) for the three-member scenario of Fase 3
- [ ] Performance pass: index rebuild time, 1k objects / 10k blocks budget
- [ ] Electron packaging (already on linda roadmap) → true local-first desktop

## 5. Risks

| Risk | Mitigation |
|---|---|
| zen Spaces layer slips (Fase 0 blocks everything) | Fase 1–2 can start against a **mock SpaceService** (single-user, local keyring, no ACL) and swap in the real one; only Fase 3 hard-depends on zen M0–M2 |
| LWW-per-block feels lossy for heavy co-editing | Accepted for MVP; block granularity is fine for notes/tasks; sequence CRDT is a labeled future work item |
| ACL finality window (T) confuses users | UI shows explicit "pending" badges on membership changes; writes keep working under the previous roster until finalization |
| akaoio/zen ↔ scobru/zen divergence | Pin the fork; upstream the Spaces layer when stable |
| Race: revoke lands while revoked member is writing | Writes encrypted with old kid remain readable to remaining members; PEN rejects post-finalization writes; document the window |

## 6. Out of scope (MVP)

- Per-character collaborative text (sequence CRDT)
- Anytype import/export compatibility
- Mobile clients
- Storage incentives / archival guarantees for fraud evidence
