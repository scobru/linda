// A bot and a person, both real Sessions on an in-process testnet — the same harness as
// `session.test.ts`, for the same reason: what matters is how messages actually arrive.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import b4a from 'b4a'
import createTestnet from 'hyperdht/testnet.js'
import { generateKeypair } from '../src/identity/keypair.js'
import { Session } from '../src/app/session.js'
import type { Identity } from '../src/identity/index.js'
import type { SwarmTransport } from '../src/network/swarm.js'
import { encodeInvite, decodeInvite } from '../src/ui/qr-core.js'
import { LindaBot } from '../src/bot/bot.js'
import { parseCommand } from '../src/bot/commands.js'

// ── Commands ──────────────────────────────────────────────────────────────

test('a command is a slash and a name at the very start of the message', () => {
  assert.deepEqual(parseCommand('/ping'), { name: 'ping', args: '', argv: [] })
  assert.deepEqual(parseCommand('  /Echo  hello   world '), { name: 'echo', args: 'hello   world', argv: ['hello', 'world'] })
  assert.deepEqual(parseCommand('/help@linda_bot'), { name: 'help', args: '', argv: [] })
  assert.deepEqual(parseCommand('/note first line\nsecond'), { name: 'note', args: 'first line\nsecond', argv: ['first', 'line', 'second'] })
})

test('a slash anywhere else is conversation', () => {
  assert.equal(parseCommand('try /ping'), null)
  assert.equal(parseCommand('/'), null)
  assert.equal(parseCommand('//comment'), null)
  assert.equal(parseCommand('/path/to/file'), null)
  assert.equal(parseCommand(''), null)
})

// ── Bots on the wire ──────────────────────────────────────────────────────

const SETTLE_MS = 30_000

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> }> | null = null
function transport(): Promise<SwarmTransport> {
  testnetPromise ??= createTestnet(4)
  return testnetPromise.then((net) => ({ bootstrap: (net as { bootstrap: never }).bootstrap }))
}
after(async () => {
  const net = await testnetPromise
  if (net) await net.destroy()
})

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

async function waitFor(check: () => boolean | Promise<boolean>, label: string, timeoutMs = SETTLE_MS): Promise<void> {
  const start = Date.now()
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function messages(session: Session, roomId: string) {
  const room = session.getRoom(roomId)!
  const out = []
  for (let i = 0; i < room.messageCount; i++) out.push(await room.getMessage(i))
  return out
}

/** A person with a room, and a ping bot that has joined it. */
async function setup(t: { after(fn: () => Promise<void>): void }) {
  const net = await transport()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-bot-test-'))
  const person = makeIdentity()
  const session = await Session.create(person, path.join(base, 'person'), { transport: net })
  const botDir = path.join(base, 'bot')
  const bots: LindaBot[] = []

  const startBot = async () => {
    const bot = await LindaBot.start({ storageDir: botDir, passphrase: 'test', nickname: 'Ping Bot', transport: net })
    bot.command('ping', (ctx) => ctx.reply('pong').then(() => {}))
    bots.push(bot)
    return bot
  }

  t.after(async () => {
    for (const bot of bots) await bot.close().catch(() => {})
    await session.close()
    fs.rmSync(base, { recursive: true, force: true })
  })

  const room = await session.createRoom('bot-room')
  const link = encodeInvite({ name: 'bot-room', key: session.inviteLinkFor(room.id) })
  return { session, person, room, link, startBot }
}

async function joined(bot: LindaBot, session: Session, link: string, roomId: string) {
  await bot.join(link)
  await waitFor(() => {
    const botRoom = bot.session.getRoom(roomId)
    return Boolean(botRoom?.writable && botRoom.hasKey)
  }, 'the bot to be granted write access and the room key')
  await waitFor(() => session.getRoom(roomId)!.listMembers().some((m) => m.identityId === bot.id), 'the bot to be a member')
}

test('a bot answers a command in a room it joined, as a reply', async (t) => {
  const { session, person, room, link, startBot } = await setup(t)
  const bot = await startBot()
  assert.ok(bot.createdMnemonic, 'a first start creates the identity and hands over its recovery phrase')
  await joined(bot, session, link, room.id)

  const ping = await room.send(person.id, '/ping')
  await waitFor(async () => (await messages(session, room.id)).some((m) => m.authorId === bot.id), "the bot's answer")

  const answer = (await messages(session, room.id)).find((m) => m.authorId === bot.id)!
  assert.equal(answer.body, 'pong')
  assert.equal(answer.replyTo, ping.id)
})

test('history from before the bot joined is not answered', async (t) => {
  const { session, person, room, link, startBot } = await setup(t)
  await room.send(person.id, '/ping')
  const bot = await startBot()
  await joined(bot, session, link, room.id)

  await room.send(person.id, '/ping')
  await waitFor(async () => (await messages(session, room.id)).some((m) => m.authorId === bot.id), "the bot's answer")
  // Room for a second, wrong answer to arrive before counting.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.equal((await messages(session, room.id)).filter((m) => m.authorId === bot.id).length, 1)
})

test('a bot that was offline answers what it missed once, and nothing twice', async (t) => {
  const { session, person, room, link, startBot } = await setup(t)
  const first = await startBot()
  await joined(first, session, link, room.id)
  await room.send(person.id, '/ping')
  await waitFor(async () => (await messages(session, room.id)).filter((m) => m.authorId === first.id).length === 1, 'the first answer')
  await first.close()

  await room.send(person.id, '/ping')
  const second = await startBot()
  assert.equal(second.createdMnemonic, null, 'a restart reuses the stored identity')
  assert.equal(second.id, first.id)

  await waitFor(async () => (await messages(session, room.id)).filter((m) => m.authorId === second.id).length === 2,
    'the answer to the message sent while it was offline')
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.equal((await messages(session, room.id)).filter((m) => m.authorId === second.id).length, 2)
})

test('a contact link from the bot opens a direct chat it answers in', async (t) => {
  const { session, person, startBot } = await setup(t)
  const bot = await startBot()
  const link = await bot.createContactLink()
  const invite = decodeInvite(link)!
  assert.equal(invite.kind, 'contact')
  assert.equal(invite.from, bot.id)

  const dm = await session.acceptContactInvite({ from: invite.from!, name: invite.name, key: invite.key })
  await waitFor(() => dm.writable && dm.hasKey, 'the direct chat to open for writing')

  await dm.send(person.id, '/ping')
  await waitFor(async () => (await messages(session, dm.id)).some((m) => m.authorId === bot.id && m.body === 'pong'),
    "the bot's answer in the direct chat")
})
