import test from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeBotProfile, parseBotProfile, commandSuggestions, withBotPresence, botsAmong, MAX_BOT_COMMANDS, MAX_BOT_PROFILE_BYTES,
  type BotProfile
} from '../src/bot/bot-profile.js'
import { presenceEncoding } from '../src/network/encoding.js'
import c from 'compact-encoding'

// ---------------------------------------------------------------------------
// What a bot says about itself travels on `presence`, a message every build already exchanges. The
// field is a claim from a peer, so it is read defensively; and it rides at the tail, so a build
// that predates bots still reads the rest.
// ---------------------------------------------------------------------------

test('a profile survives the wire, canonical', () => {
  const profile: BotProfile = { commands: [{ name: 'ping', description: 'Checks the bot is there' }, { name: 'echo', description: '' }] }
  assert.deepEqual(parseBotProfile(encodeBotProfile(profile)), profile)
})

test('an absent or unreadable field is a person, not a broken bot', () => {
  for (const field of [undefined, null, '', 'not json', '[]', '"string"', '42']) {
    assert.equal(parseBotProfile(field as string | undefined), null, String(field))
  }
  assert.equal(parseBotProfile('x'.repeat(MAX_BOT_PROFILE_BYTES + 1)), null, 'too big to hold')
})

test('a bot with no command list is still a bot', () => {
  assert.deepEqual(parseBotProfile('{}'), { commands: [] })
  assert.deepEqual(parseBotProfile('{"commands":"nope"}'), { commands: [] })
})

test('bad commands are dropped, the rest kept', () => {
  const profile = parseBotProfile(JSON.stringify({
    commands: [
      { name: '/Ping', description: '  Checks\n  the bot  ' },
      { name: 'ping', description: 'a duplicate' },
      { name: 'has space' },
      { name: '' },
      null,
      'echo',
      { name: 'x'.repeat(33) },
      { name: 'help', description: 'y'.repeat(500) }
    ]
  }))!
  assert.deepEqual(profile.commands.map((c) => c.name), ['ping', 'help'])
  assert.equal(profile.commands[0]!.description, 'Checks the bot')
  assert.equal(profile.commands[1]!.description.length, 120)
})

test('no more commands than the apps will draw', () => {
  const commands = Array.from({ length: MAX_BOT_COMMANDS + 10 }, (_, i) => ({ name: `c${i}`, description: '' }))
  assert.equal(parseBotProfile(JSON.stringify({ commands }))!.commands.length, MAX_BOT_COMMANDS)
})

test('suggestions: a single slash-word being typed, prefix-matched, one per name, sorted', () => {
  const bots = new Map<string, BotProfile>([
    ['bot-a', { commands: [{ name: 'ping', description: 'A pings' }, { name: 'help', description: 'A helps' }] }],
    ['bot-b', { commands: [{ name: 'poll', description: 'B polls' }, { name: 'ping', description: 'B pings' }] }]
  ])
  assert.deepEqual(commandSuggestions('/', bots).map((s) => s.name), ['help', 'ping', 'poll'])
  assert.deepEqual(commandSuggestions('/p', bots).map((s) => `${s.name}:${s.botId}`), ['ping:bot-a', 'poll:bot-b'])
  assert.deepEqual(commandSuggestions('/PO', bots).map((s) => s.name), ['poll'])
  assert.deepEqual(commandSuggestions('/ping ', bots), [], 'chosen already')
  assert.deepEqual(commandSuggestions('hi /p', bots), [], 'not at the start')
  assert.deepEqual(commandSuggestions('p', bots), [])
  assert.deepEqual(commandSuggestions('/', new Map()), [], 'no bots in the room')
  assert.equal(commandSuggestions('/', bots, 2).length, 2)
})

test('presence with a bot field reads back, and one without it still decodes', () => {
  const bot = encodeBotProfile({ commands: [{ name: 'ping', description: '' }] })
  const withBot = c.encode(presenceEncoding, { userId: 'u', online: true, nickname: 'Bot', avatar: '', bot })
  assert.equal(c.decode(presenceEncoding, withBot).bot, bot)

  // What a build from before bots sends: the same message without the trailing field.
  const person = c.encode(presenceEncoding, { userId: 'u', online: true, nickname: 'Ann', avatar: 'a' })
  const decoded = c.decode(presenceEncoding, person)
  assert.equal(decoded.nickname, 'Ann')
  assert.ok(!decoded.bot)
})

test('the apps keep one profile per bot heard from, and drop one that comes back as a person', () => {
  const none: ReadonlyMap<string, BotProfile> = new Map()
  const ping = encodeBotProfile({ commands: [{ name: 'ping', description: '' }] })

  const one = withBotPresence(none, { userId: 'bot', bot: ping })
  assert.deepEqual([...one.keys()], ['bot'])
  assert.equal(withBotPresence(one, { userId: 'bot', bot: ping }), one, 'unchanged: the same map, nothing to re-render')
  assert.equal(withBotPresence(one, { userId: 'ann' }), one, 'a person who was never a bot changes nothing')

  const more = withBotPresence(one, { userId: 'bot', bot: encodeBotProfile({ commands: [{ name: 'help', description: '' }] }) })
  assert.notEqual(more, one)
  assert.deepEqual(more.get('bot')!.commands.map((c) => c.name), ['help'])

  assert.equal(withBotPresence(more, { userId: 'bot', bot: '' }).size, 0)
  assert.equal(withBotPresence(more, { userId: 'bot', bot: 'garbage' }).size, 0, 'an unreadable profile is no badge')
})

test("a room's bots are the known bots among its members", () => {
  const bots = new Map<string, BotProfile>([['a', { commands: [] }], ['b', { commands: [] }]])
  assert.deepEqual([...botsAmong(bots, ['b', 'ann', 'c']).keys()], ['b'])
})
