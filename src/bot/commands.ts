/**
 * A bot command, read out of a message body: `/name rest of the line`.
 *
 * The convention is Telegram's, because it is the one people already type. Only a slash at the very
 * start counts, so a message that merely mentions `/help` in passing is conversation, not a
 * command. The name is lower-cased: `/Ping` and `/ping` are the same command on a phone keyboard
 * that capitalised it on its own.
 */
export interface BotCommand {
  /** Without the slash, lower-cased. */
  name: string
  /** Everything after the name, trimmed. */
  args: string
  /** `args` split on whitespace, empty when there are none. */
  argv: string[]
}

const COMMAND = /^\/([a-z0-9_]{1,32})(?:@\S+)?(?:\s+([\s\S]*))?$/i

export function parseCommand(body: string): BotCommand | null {
  const match = COMMAND.exec(body.trim())
  if (!match) return null
  const args = (match[2] ?? '').trim()
  return { name: match[1]!.toLowerCase(), args, argv: args ? args.split(/\s+/) : [] }
}
