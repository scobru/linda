import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { Duplex } from 'streamx'
import b4a from 'b4a'
// @ts-ignore
import createTestnet from 'hyperdht/testnet.js'
import type { SwarmTransport } from '../src/network/swarm.js'
import { generateKeypair } from '../src/identity/keypair.js'
import type { Identity } from '../src/identity/index.js'
import { Session } from '../src/app/session.js'
import { RpcClient } from '../src/transport/rpc-client.js'
import { RemoteSessionView } from '../src/transport/remote-session-view.js'
import { WorkerDispatcher, extractSessionState } from '../src/worker/dispatcher.js'

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function transport(): Promise<SwarmTransport> {
  testnetPromise ??= createTestnet(4)
  return testnetPromise.then((net) => ({ bootstrap: (net as { bootstrap: never }).bootstrap }))
}

after(async () => {
  const net = await testnetPromise
  if (net) await net.destroy()
})

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-media-test-'))
}

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

function createDuplexPair(): [Duplex, Duplex] {
  let streamA: Duplex
  let streamB: Duplex

  streamA = new Duplex({
    write(data: any, cb: (err?: Error | null) => void) {
      streamB.push(data)
      cb()
    },
    final(cb: (err?: Error | null) => void) {
      streamB.push(null)
      cb(null)
    }
  })

  streamB = new Duplex({
    write(data: any, cb: (err?: Error | null) => void) {
      streamA.push(data)
      cb()
    },
    final(cb: (err?: Error | null) => void) {
      streamA.push(null)
      cb(null)
    }
  })

  return [streamA, streamB]
}

function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks)
        })
      })
    })
    req.on('error', reject)
  })
}

test('media transport: worker media server HTTP streaming and binary upload/download roundtrip', async () => {
  const dir = tmpDir()
  const identity = makeIdentity()

  const inProcSession = await Session.create(identity, dir, {
    transport: await transport()
  })

  const [clientStream, workerStream] = createDuplexPair()
  const dispatcher = new WorkerDispatcher(workerStream, inProcSession)
  const rpcClient = new RpcClient(clientStream)
  const initialState = await extractSessionState(inProcSession)
  const remoteSession = new RemoteSessionView(rpcClient, initialState)

  try {
    // 1. Upload a binary file via remoteSession.fileStore().addBuffer
    const testBytes = Buffer.from('Linda P2P audio/video binary payload: ' + 'A'.repeat(1024))
    const fileStore = await remoteSession.fileStore()
    assert.ok(fileStore.key, 'fileStore.key should be present')

    const drivePath = '/test-room/sample-audio.mp3'
    const uploaded = await fileStore.addBuffer(drivePath, testBytes)
    assert.equal(uploaded.path, drivePath)
    assert.equal(uploaded.size, testBytes.length)

    const driveKeyHex = b4a.toString(fileStore.key, 'hex')

    // Verify in-process session has the file in its drive
    const inProcFs = await inProcSession.fileStore()
    const storedBuf = await inProcFs.drive.get(drivePath)
    assert.ok(storedBuf, 'file should be stored in Hyperdrive')
    assert.equal(b4a.toString(storedBuf), b4a.toString(testBytes))

    // 2. Binary download via remoteSession.downloadFile
    const downloadedBuf = await remoteSession.downloadFile(driveKeyHex, drivePath)
    assert.ok(downloadedBuf, 'downloadedBuf must not be null')
    assert.equal(b4a.toString(downloadedBuf), b4a.toString(testBytes))

    // 3. Media URL generation via remoteSession.mediaUrl
    const mediaUrl = await remoteSession.mediaUrl(driveKeyHex, drivePath)
    assert.ok(mediaUrl.startsWith('http://127.0.0.1:'), `expected loopback URL, got ${mediaUrl}`)
    assert.ok(mediaUrl.includes(driveKeyHex))

    // 4. Full file HTTP GET request to worker's media server
    const fullRes = await httpGet(mediaUrl)
    assert.equal(fullRes.status, 200)
    assert.equal(fullRes.headers['content-type'], 'audio/mpeg')
    assert.equal(fullRes.body.length, testBytes.length)
    assert.equal(b4a.toString(fullRes.body), b4a.toString(testBytes))

    // 5. HTTP Range request (Partial Content 206)
    const rangeRes = await httpGet(mediaUrl, { Range: 'bytes=0-31' })
    assert.equal(rangeRes.status, 206)
    assert.equal(rangeRes.headers['content-range'], `bytes 0-31/${testBytes.length}`)
    assert.equal(rangeRes.body.length, 32)
    assert.equal(b4a.toString(rangeRes.body), b4a.toString(testBytes.subarray(0, 32)))

    // Suffix range request (last 64 bytes)
    const suffixRes = await httpGet(mediaUrl, { Range: 'bytes=-64' })
    assert.equal(suffixRes.status, 206)
    assert.equal(suffixRes.body.length, 64)
    assert.equal(b4a.toString(suffixRes.body), b4a.toString(testBytes.subarray(testBytes.length - 64)))
  } catch (err) {
    console.error('EXACT ERROR:', err)
    throw err
  } finally {
    try {
      await remoteSession.close()
    } catch {}
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
})
