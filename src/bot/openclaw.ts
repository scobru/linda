try {
  process.loadEnvFile?.()
} catch {
  // .env file not present or already in environment
}

import { LindaBot, type BotContext } from './bot.js'

// ---------------------------------------------------------------------------
// OpenClaw AI Bridge for Linda
//
// Connects Linda's decentralized P2P chat with OpenClaw's local autonomous
// agent gateway (http://127.0.0.1:18789).
//
// Environment variables:
//   OPENCLAW_URL           Gateway URL (default: http://127.0.0.1:18789)
//   OPENCLAW_TOKEN         Gateway auth token (if authentication is enabled)
//   OPENCLAW_MODEL         Model / agent name (default: "openclaw")
//   LINDA_BOT_DIR          Storage directory (default: "./.bot-openclaw-storage")
//   LINDA_BOT_PASSPHRASE   Encryption passphrase for bot identity (required)
//   LINDA_BOT_NAME         Display nickname (default: "OpenClaw")
//   LINDA_BOT_ALLOWED_USERS Comma-separated Linda IDs allowed to use OpenClaw
//   LINDA_BOT_ALLOWED_ROOMS Comma-separated room IDs or invite links allowed
//   LINDA_BOT_JOIN         Optional linda-pear:// link to join on startup
// ---------------------------------------------------------------------------

const passphrase = process.env.LINDA_BOT_PASSPHRASE
if (!passphrase) {
  console.error('Set LINDA_BOT_PASSPHRASE: it encrypts the bot\'s identity on disk.')
  process.exit(1)
}

const openClawUrl = (process.env.OPENCLAW_URL || 'http://127.0.0.1:18789').replace(/\/+$/, '')
const openClawToken = process.env.OPENCLAW_TOKEN || ''
const openClawModel = process.env.OPENCLAW_MODEL || ''
const defaultAgent = process.env.OPENCLAW_AGENT || process.env.OPENCLAW_AGENT_ID || 'coordinator'

/** Active agent per room: defaults to coordinator, changeable with /agent <id> */
const roomAgents = new Map<string, string>()

function getRoomAgent(roomId: string): string {
  return roomAgents.get(roomId) || defaultAgent
}

/** Session epochs per room: allows /reset or /new to start a fresh conversation context */
const roomSessions = new Map<string, number>()

function getSessionKey(roomId: string): string {
  const epoch = roomSessions.get(roomId) ?? 0
  return `linda:${roomId}:${epoch}`
}

function resetSession(roomId: string): void {
  const epoch = (roomSessions.get(roomId) ?? 0) + 1
  roomSessions.set(roomId, epoch)
}

function list(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

const bot = await LindaBot.start({
  storageDir: process.env.LINDA_BOT_DIR || './.bot-openclaw-storage',
  passphrase,
  nickname: process.env.LINDA_BOT_NAME || 'OpenClaw',
  access: {
    users: list(process.env.LINDA_BOT_ALLOWED_USERS),
    rooms: list(process.env.LINDA_BOT_ALLOWED_ROOMS)
  }
})

if (bot.createdMnemonic) {
  console.log('New OpenClaw bot identity. Recovery phrase — store it somewhere safe:\n')
  console.log(`  ${bot.createdMnemonic}\n`)
}

console.log(`OpenClaw bot identity ID: ${bot.id}`)
console.log(`OpenClaw Gateway endpoint: ${openClawUrl}`)

// Check gateway connection
try {
  const rootCheck = await fetch(`${openClawUrl}/`, {
    headers: openClawToken ? { Authorization: `Bearer ${openClawToken}` } : {}
  }).catch(() => null)

  if (rootCheck) {
    console.log(`[OpenClaw] Gateway detected at ${openClawUrl} (HTTP ${rootCheck.status})`)

    // Check if chatCompletions endpoint is active
    const completionsCheck = await fetch(`${openClawUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openclaw-agent-id': defaultAgent,
        ...(openClawToken ? { Authorization: `Bearer ${openClawToken}` } : {})
      },
      body: JSON.stringify({
        model: openClawModel || `openclaw:${defaultAgent}`,
        messages: [{ role: 'user', content: 'ping' }]
      })
    }).catch(() => null)

    if (completionsCheck?.status === 404) {
      console.warn(`[OpenClaw] ⚠️ ChatCompletions endpoint is disabled in OpenClaw.`)
      console.warn(`[OpenClaw] Run on your OpenClaw machine:`)
      console.warn(`  openclaw config set gateway.http.endpoints.chatCompletions.enabled true`)
      console.warn(`  openclaw gateway restart\n`)
    } else if (completionsCheck?.status === 401 || completionsCheck?.status === 403) {
      if (!openClawToken) {
        console.warn(`[OpenClaw] ⚠️ Gateway requires authentication but OPENCLAW_TOKEN is not set in .env.`)
        console.warn(`[OpenClaw] Run: openclaw config get gateway.auth.token and add it to .env:`)
        console.warn(`  OPENCLAW_TOKEN=<your-token>\n`)
      } else {
        console.warn(`[OpenClaw] ⚠️ Gateway authentication failed. Check that OPENCLAW_TOKEN in .env is correct.\n`)
      }
    } else {
      console.log(`[OpenClaw] Ready to handle chat completions (default agent: ${defaultAgent}) ✅`)
    }
  } else {
    console.log(`[OpenClaw] Note: Gateway not detected at ${openClawUrl}. Make sure 'openclaw gateway' is running.`)
  }
} catch {
  console.log(`[OpenClaw] Note: Gateway not detected at ${openClawUrl}. Make sure 'openclaw gateway' is running.`)
}

console.log(`\nContact link (paste in Linda -> Join to start a direct chat):\n${await bot.createContactLink()}\n`)

/** Check if a room is a 1-to-1 direct chat with a contact */
function isDirectChat(roomId: string): boolean {
  return bot.session.listContacts().some((c) => c.status === 'accepted' && c.roomId === roomId)
}

/** Queries OpenClaw with streaming and writes chunks into Linda chat */
async function queryOpenClaw(ctx: BotContext, prompt: string): Promise<void> {
  const trimmed = prompt.trim()
  if (!trimmed) return

  const stream = ctx.stream()
  const sessionKey = getSessionKey(ctx.roomId)
  const agentId = getRoomAgent(ctx.roomId)

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-openclaw-session-key': sessionKey,
      'x-openclaw-agent-id': agentId
    }
    if (openClawToken) {
      headers.Authorization = `Bearer ${openClawToken}`
    }

    const modelTarget = openClawModel || `openclaw:${agentId}`
    const res = await fetch(`${openClawUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelTarget,
        messages: [
          { role: 'user', content: trimmed }
        ],
        stream: true,
        user: ctx.message.authorId
      })
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      let message = `OpenClaw HTTP error ${res.status}: ${res.statusText}`
      if (res.status === 401 || res.status === 403) {
        message += ' (authentication failed, check OPENCLAW_TOKEN)'
      } else if (errText) {
        message += ` - ${errText.slice(0, 200)}`
      }
      await ctx.reply(message)
      return
    }

    if (!res.body) {
      await ctx.reply('No response stream received from OpenClaw.')
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let receivedAnyText = false

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const lineTrimmed = line.trim()
        if (!lineTrimmed.startsWith('data:')) continue
        const data = lineTrimmed.slice(5).trim()
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            receivedAnyText = true
            await stream.write(content)
          }
        } catch {
          // Non-JSON SSE event or comment
        }
      }
    }

    if (!receivedAnyText) {
      // In case OpenClaw returned an empty completion or tool execution without text
      await stream.write('(OpenClaw executed the task with no text output)')
    }
  } catch (err) {
    const errorMsg = (err as Error).message || String(err)
    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch failed')) {
      await ctx.reply(`Cannot connect to OpenClaw at ${openClawUrl}. Make sure 'openclaw gateway' is running.`)
    } else {
      await ctx.reply(`Error from OpenClaw: ${errorMsg}`)
    }
  } finally {
    await stream.end()
  }
}

// ---------------------------------------------------------------------------
// Bot Commands
// ---------------------------------------------------------------------------

const helpText = [
  '🤖 OpenClaw AI Assistant for Linda',
  '',
  'Commands:',
  '/ask <prompt> — Send a prompt to OpenClaw (required in group rooms)',
  '/agent <id> — Switch or view the active OpenClaw agent for this room (e.g. coordinator, openclaw, researcher, reviewer, writer)',
  '/new or /reset — Start a fresh conversation session in this room',
  '/link — Create a new one-time Linda contact link',
  '/join <link> — Join a room or contact invite',
  '/ping — Test connection to Linda bot and OpenClaw Gateway',
  '/help — Show this help message',
  '',
  'In a 1-to-1 direct chat, you can also just send messages directly without /ask.'
].join('\n')

bot
  .command('ask', async (ctx) => {
    const prompt = ctx.command?.args
    if (!prompt) {
      await ctx.reply('Usage: /ask <your message or question for OpenClaw>')
      return
    }
    await queryOpenClaw(ctx, prompt)
  }, 'Ask OpenClaw AI a question or give a task')
  .command('agent', async (ctx) => {
    const target = ctx.command?.args?.trim()
    const current = getRoomAgent(ctx.roomId)
    if (!target) {
      await ctx.reply(`Active OpenClaw agent in this room: ${current}\nTo switch: /agent <id> (e.g. /agent coordinator, /agent openclaw, /agent researcher, /agent reviewer, /agent writer)`)
      return
    }
    roomAgents.set(ctx.roomId, target)
    await ctx.reply(`Switched active OpenClaw agent for this room to: ${target}`)
  }, 'Show or switch active OpenClaw agent for this room')
  .command('new', async (ctx) => {
    resetSession(ctx.roomId)
    await ctx.reply('🔄 OpenClaw conversation context cleared for this room. What would you like to do next?')
  }, 'Start a fresh conversation context in this room')
  .command('reset', async (ctx) => {
    resetSession(ctx.roomId)
    await ctx.reply('🔄 OpenClaw conversation context cleared for this room. What would you like to do next?')
  }, 'Start a fresh conversation context in this room')
  .command('ping', async (ctx) => {
    const stopTyping = ctx.typing()
    let gatewayStatus = 'unknown'
    try {
      const res = await fetch(`${openClawUrl}/`, {
        headers: openClawToken ? { Authorization: `Bearer ${openClawToken}` } : {}
      }).catch(() => null)
      gatewayStatus = res ? `connected (HTTP ${res.status}) ✅` : 'offline ❌'
    } catch {
      gatewayStatus = 'offline ❌'
    } finally {
      stopTyping()
    }
    await ctx.reply(`pong!\nLinda bot: online ✅\nOpenClaw Gateway (${openClawUrl}): ${gatewayStatus}`)
  }, 'Checks bot and OpenClaw gateway connection')
  .command('help', async (ctx) => {
    await ctx.reply(helpText)
  }, 'Lists commands and usage')
  .command('link', async (ctx) => {
    await ctx.reply(await bot.createContactLink())
  }, 'Generate a fresh contact link for one more person')
  .command('join', async (ctx) => {
    const link = ctx.command?.args
    if (!link) return void (await ctx.reply('Usage: /join <linda-pear:// link>'))
    try {
      await bot.join(link)
      await ctx.reply('Joined.')
    } catch (err) {
      await ctx.reply(`Could not join: ${(err as Error).message}`)
    }
  }, 'Join a Linda room from its invite link')
  .onMessage(async (ctx) => {
    // If it's an explicit slash command that was already registered, let command handlers handle it
    if (ctx.command) return

    // In a 1-to-1 direct chat, every regular message is an implicit prompt to OpenClaw
    if (isDirectChat(ctx.roomId)) {
      await queryOpenClaw(ctx, ctx.message.body)
      return
    }

    // In group rooms, check if the bot was mentioned by name (e.g., "@OpenClaw hello" or "OpenClaw: hello")
    const botName = bot.session.getNickname() || 'openclaw'
    const mentionPattern = new RegExp(`^@?${botName}[:\\s,]+([\\s\\S]+)$`, 'i')
    const match = mentionPattern.exec(ctx.message.body.trim())
    if (match?.[1]) {
      await queryOpenClaw(ctx, match[1])
    }
  })

const initialJoin = process.env.LINDA_BOT_JOIN
if (initialJoin) {
  console.log(`Joined room ${await bot.join(initialJoin)}`)
}

console.log('OpenClaw Linda Bot is running. Press Ctrl+C to stop.')
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.close().finally(() => process.exit(0))
  })
}
