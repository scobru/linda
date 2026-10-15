// A smoke test of the desktop app through its real UI: Electron, driven by Playwright.
//
// What the unit and Session tests cannot say is whether the screen they feed still works:
// `src/ui/app-shell.ts` is 4500 lines of DOM code with no other coverage, so a refactor of it
// had nothing to fail. This walks the main path once — create an identity, create a room, send a
// message, look at every view, restart and unlock — and fails on any uncaught renderer error.
//
// It starts a real Electron window, so it is not part of `npm test`. Run `npm run test:ui`. On a
// machine without a display (CI, a container) it needs `xvfb-run`, which the script uses on Linux.
// It never needs the network: the swarm just finds no peers.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const PASSPHRASE = 'smoke-test-passphrase'
const ROOM = 'smoke-room'
const MESSAGE = 'hello from the smoke test'

/** The Electron binary, or why there is none: `npm ci --ignore-scripts` skips its download. */
function electronBinary() {
  try {
    const bin = require('electron')
    return typeof bin === 'string' && fs.existsSync(bin) ? bin : null
  } catch {
    return null
  }
}

const binary = electronBinary()
const noDisplay = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
const skip = !binary
  ? 'the Electron binary is not installed (run `node node_modules/electron/install.js`)'
  : noDisplay
    ? 'no display; run through `npm run test:ui`, which uses xvfb-run'
    : false

async function launch(storageDir) {
  const { _electron: electron } = await import('playwright-core')
  const app = await electron.launch({
    executablePath: binary,
    // The sandbox needs a setuid helper that a container does not have; GPU adds nothing here.
    args: ['--no-sandbox', '--disable-gpu', path.join(root, 'electron', 'main.cjs')],
    env: { ...process.env, LINDA_PEAR_STORAGE_DIR: storageDir },
    timeout: 60_000
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  return { app, page, errors }
}

const shellText = (page) => page.evaluate(() => document.querySelector('app-shell').textContent.replace(/\s+/g, ' '))
const messagesText = (page) => page.evaluate(() => document.querySelector('#messages').innerText.replace(/\s+/g, ' '))

/** Polls rather than sleeping: the UI redraws on its own schedule. */
async function until(read, accept, label, timeoutMs = 15_000) {
  const start = Date.now()
  let last
  while (Date.now() - start < timeoutMs) {
    last = await read()
    if (accept(last)) return last
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(`timed out waiting for ${label}; last saw: ${String(last).slice(0, 200)}`)
}

test('the desktop app: first run, a room and a message, then a restart', { skip }, async (t) => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-ui-smoke-'))
  let session = null
  t.after(async () => {
    await session?.app.close().catch(() => {})
    fs.rmSync(storageDir, { recursive: true, force: true })
  })

  session = await launch(storageDir)
  let { page } = session

  await t.test('a fresh install asks for a passphrase', async () => {
    await page.waitForSelector('#pass')
    assert.match(await shellText(page), /Create Identity/)
  })

  await t.test('creating an identity shows the recovery phrase, then the app', async () => {
    await page.fill('#pass', PASSPHRASE)
    await page.click('#submit')
    await page.waitForSelector('#confirm', { timeout: 30_000 })
    assert.match(await shellText(page), /Recovery Phrase/)
    await page.check('#confirm')
    await page.click('#continue')
    await page.waitForSelector('#composeBtn', { timeout: 60_000 })
    assert.match(await shellText(page), /Personal Vault/, 'the personal vault exists from the start')
    // The default rooms are added a moment after the list first draws.
    await until(() => shellText(page), (text) => text.includes('Linda Welcome') && text.includes('Linda News'), 'the two default rooms')
  })

  await t.test('creating a room opens it', async () => {
    await page.click('#composeBtn')
    await page.fill('#newGroupName', ROOM)
    await page.click('#createGroupSubmit')
    await page.waitForSelector('#body', { timeout: 30_000 })
    assert.match(await shellText(page), new RegExp(ROOM))
  })

  await t.test('a sent message appears in the chat', async () => {
    await page.fill('#body', MESSAGE)
    await page.click('#send')
    assert.match(await until(() => messagesText(page), (text) => text.includes(MESSAGE), 'the message in the chat'), new RegExp(MESSAGE))
  })

  await t.test('the Mailbox and Notes views show the same message, and Files opens', async () => {
    for (const tab of ['#roomTabMailbox', '#roomTabDoc']) {
      await page.click(tab)
      await until(() => shellText(page), (text) => text.includes(MESSAGE), `${tab} to show the message`)
    }
    await page.click('#roomTabFiles')
    await page.click('#roomTabChat')
    await until(() => messagesText(page), (text) => text.includes(MESSAGE), 'the chat view again')
  })

  await t.test('the profile drawer opens', async () => {
    await page.click('#topbarUserBtn')
    await page.waitForSelector('#profileDrawer.open')
    await page.click('#closeDrawerBtn')
  })

  await t.test('after a restart the passphrase unlocks the room and its message', async () => {
    const first = session
    await first.app.close()
    session = await launch(storageDir)
    page = session.page
    await page.waitForSelector('#pass', { timeout: 30_000 })
    assert.match(await shellText(page), /Unlock Identity/)
    await page.fill('#pass', PASSPHRASE)
    await page.click('#submit')
    await page.waitForSelector('#composeBtn', { timeout: 60_000 })
    await until(() => shellText(page), (text) => text.includes(ROOM), 'the room in the list')
    await page.evaluate((name) => {
      const label = [...document.querySelectorAll('app-shell *')].find((e) => e.children.length === 0 && e.textContent.trim() === name)
      label.click()
    }, ROOM)
    await until(() => messagesText(page), (text) => text.includes(MESSAGE), 'the message after the restart')
    assert.deepEqual([...first.errors, ...session.errors], [], 'no uncaught error in the renderer')
  })
})

// Known bug, found by this test: until the app is restarted the sidebar shows "message unavailable"
// for a room, including one whose only message the chat displays fine. Marked `todo` so it records
// the bug without failing the run; turn it into a plain test when the bug is fixed.
test('the sidebar previews the latest message without a restart', { skip, todo: 'sidebar shows "message unavailable" until restart' }, async (t) => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-ui-smoke-'))
  const { app, page } = await launch(storageDir)
  t.after(async () => {
    await app.close().catch(() => {})
    fs.rmSync(storageDir, { recursive: true, force: true })
  })
  await page.waitForSelector('#pass')
  await page.fill('#pass', PASSPHRASE)
  await page.click('#submit')
  await page.waitForSelector('#confirm', { timeout: 30_000 })
  await page.check('#confirm')
  await page.click('#continue')
  await page.waitForSelector('#composeBtn', { timeout: 60_000 })
  await page.click('#composeBtn')
  await page.fill('#newGroupName', ROOM)
  await page.click('#createGroupSubmit')
  await page.waitForSelector('#body', { timeout: 30_000 })
  await page.fill('#body', MESSAGE)
  await page.click('#send')
  await until(() => messagesText(page), (text) => text.includes(MESSAGE), 'the message in the chat')
  const sidebar = await page.evaluate(() => document.querySelector('#roomList, .room-list, aside')?.textContent.replace(/\s+/g, ' ') ?? '')
  const all = await shellText(page)
  assert.ok(!(sidebar || all).includes('message unavailable'), 'the sidebar should not say the message is unavailable')
})
