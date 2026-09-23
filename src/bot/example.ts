import { LindaBot } from './bot.js'

// ---------------------------------------------------------------------------
// An example bot: `npm run bot:example`.
//
//   LINDA_BOT_DIR         where it keeps its identity and rooms  (default ./.bot-storage)
//   LINDA_BOT_PASSPHRASE  encrypts the identity at rest          (required)
//   LINDA_BOT_NAME        its nickname                           (default "Linda Bot")
//   LINDA_BOT_JOIN        a linda-pear:// link to join on start  (optional)
//   LINDA_BOT_ALLOWED_USERS  identity ids it listens to, comma-separated (optional: everyone)
//   LINDA_BOT_ALLOWED_ROOMS  room ids or invite links it may be in, comma-separated (optional: any)
//
// On first start it prints its recovery phrase — keep it, it is the bot's identity — and on every
// start a contact link: open it in Linda to get a direct chat with the bot. To add it to a room,
// send it that room's invite link with /join.
// ---------------------------------------------------------------------------

const passphrase = process.env.LINDA_BOT_PASSPHRASE
if (!passphrase) {
  console.error('Set LINDA_BOT_PASSPHRASE: it encrypts the bot\'s identity on disk.')
  process.exit(1)
}

const bot = await LindaBot.start({
  storageDir: process.env.LINDA_BOT_DIR || './.bot-storage',
  passphrase,
  nickname: process.env.LINDA_BOT_NAME || 'Linda Bot',
  access: {
    users: list(process.env.LINDA_BOT_ALLOWED_USERS),
    rooms: list(process.env.LINDA_BOT_ALLOWED_ROOMS)
  }
})

/** A comma-separated variable as a list, or undefined when it is not set. */
function list(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

if (bot.createdMnemonic) {
  console.log('New bot identity. Recovery phrase — store it somewhere safe:\n')
  console.log(`  ${bot.createdMnemonic}\n`)
}
console.log(`Bot id: ${bot.id}`)
console.log(`Contact link (one person each): ${await bot.createContactLink()}`)

const help = [
  '/ping — pong',
  '/echo <text> — says it back',
  '/link — a contact link to share, for one more person',
  '/join <linda-pear:// link> — joins that room',
  '/help — this list'
].join('\n')

bot
  .command('ping', (ctx) => ctx.reply('pong').then(() => {}), 'Checks the bot is there')
  .command('echo', (ctx) => ctx.reply(ctx.command?.args || '(nothing to echo)').then(() => {}), 'Says your text back')
  .command('help', (ctx) => ctx.reply(help).then(() => {}), 'Lists the commands')
  .command('link', async (ctx) => { await ctx.reply(await bot.createContactLink()) }, 'A contact link for one more person')
  .command('join', async (ctx) => {
    const link = ctx.command?.args
    if (!link) return void (await ctx.reply('Usage: /join <linda-pear:// link>'))
    try {
      await bot.join(link)
      await ctx.reply('Joined.')
    } catch (err) {
      await ctx.reply(`Could not join: ${(err as Error).message}`)
    }
  }, 'Joins a room from its invite link')
  .onMessage((ctx) => {
    console.log(`[${ctx.roomId.slice(0, 8)}] ${ctx.message.authorId.slice(0, 8)}: ${ctx.message.body}`)
  })

const join = process.env.LINDA_BOT_JOIN
if (join) console.log(`Joined room ${await bot.join(join)}`)

console.log('Running. Ctrl+C to stop.')
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.close().finally(() => process.exit(0))
  })
}
