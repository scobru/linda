// ---------------------------------------------------------------------------
// What a bot says about itself, and what the apps do with it.
//
// A bot is a peer like any other, so nothing on the wire said "this is a program" — people saw a
// name, wrote to it, and had to guess which words it understood. A bot now announces itself in its
// presence: that it is one, and the commands it answers. The apps put a badge next to its name and
// suggest its commands when someone types `/`.
//
// It travels as one trailing optional string on `presence` (JSON), the pattern `message-encoding.ts`
// documents: a build that predates it reads a shorter frame and sees a person, which is exactly
// what it saw before. It is a claim a peer makes about itself, like its nickname — the badge says
// "this identity says it is a bot", not more — so it is read defensively and bounded in size.
// ---------------------------------------------------------------------------

export interface BotCommandInfo {
  /** Without the slash, lower-case. */
  name: string
  /** One line for the suggestion list; may be empty. */
  description: string
}

export interface BotProfile {
  commands: BotCommandInfo[]
}

/** Bounds on what a peer can make the apps hold and draw for it. */
export const MAX_BOT_PROFILE_BYTES = 4096
export const MAX_BOT_COMMANDS = 32
const MAX_DESCRIPTION = 120
const COMMAND_NAME = /^[a-z0-9_]{1,32}$/

/** The wire form. An empty command list is still a bot. */
export function encodeBotProfile(profile: BotProfile): string {
  return JSON.stringify({ commands: normaliseCommands(profile.commands) })
}

/**
 * The wire form read back, or null when the field is absent (a person, or a build that predates
 * bots) or cannot be trusted as one. Anything malformed inside a valid profile is dropped rather
 * than failing the whole: one bad command should not cost a bot its badge.
 */
export function parseBotProfile(field: string | undefined | null): BotProfile | null {
  if (!field || field.length > MAX_BOT_PROFILE_BYTES) return null
  let raw: unknown
  try {
    raw = JSON.parse(field)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const commands = (raw as { commands?: unknown }).commands
  return { commands: Array.isArray(commands) ? normaliseCommands(commands) : [] }
}

function normaliseCommands(commands: readonly unknown[]): BotCommandInfo[] {
  const seen = new Set<string>()
  const out: BotCommandInfo[] = []
  for (const entry of commands) {
    if (!entry || typeof entry !== 'object') continue
    const name = String((entry as { name?: unknown }).name ?? '').replace(/^\//, '').toLowerCase()
    if (!COMMAND_NAME.test(name) || seen.has(name)) continue
    seen.add(name)
    const description = String((entry as { description?: unknown }).description ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION)
    out.push({ name, description })
    if (out.length === MAX_BOT_COMMANDS) break
  }
  return out
}

/** A command offered while typing, with the bot it belongs to. */
export interface CommandSuggestion extends BotCommandInfo {
  botId: string
}

/**
 * The commands to offer for what is in the composer, from the bots given (the room's members that
 * are bots).
 *
 * Only while the text is a single `/word` still being typed: once there is a space the command has
 * been chosen, and a slash later in a sentence is not a command at all (see `parseCommand`).
 * Prefix matches, alphabetical, one entry per name — two bots answering the same command is one
 * thing to type.
 */
export function commandSuggestions(text: string, bots: ReadonlyMap<string, BotProfile>, limit = 8): CommandSuggestion[] {
  const match = /^\/([a-z0-9_]*)$/i.exec(text)
  if (!match) return []
  const prefix = match[1]!.toLowerCase()
  const byName = new Map<string, CommandSuggestion>()
  for (const [botId, profile] of bots) {
    for (const command of profile.commands) {
      if (!command.name.startsWith(prefix) || byName.has(command.name)) continue
      byName.set(command.name, { ...command, botId })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit)
}

/**
 * The bots known so far, after one more presence message: added or updated when it carries a
 * profile, dropped when it does not (the same identity running as a person again). The same map
 * back when nothing changed, so a UI holding it as state is not re-rendered for every presence
 * ping.
 *
 * What an app knows is what it has heard since it started: a bot that has not been online since
 * then has no badge yet.
 */
export function withBotPresence(
  bots: ReadonlyMap<string, BotProfile>,
  presence: { userId: string; bot?: string | null }
): ReadonlyMap<string, BotProfile> {
  const profile = parseBotProfile(presence.bot)
  const known = bots.get(presence.userId)
  if (!profile) {
    if (!known) return bots
    const next = new Map(bots)
    next.delete(presence.userId)
    return next
  }
  if (known && encodeBotProfile(known) === encodeBotProfile(profile)) return bots
  return new Map(bots).set(presence.userId, profile)
}

/** The bots among `ids` — a room's members, for the commands to offer in that room. */
export function botsAmong(bots: ReadonlyMap<string, BotProfile>, ids: Iterable<string>): Map<string, BotProfile> {
  const out = new Map<string, BotProfile>()
  for (const id of ids) {
    const profile = bots.get(id)
    if (profile) out.set(id, profile)
  }
  return out
}
