import { test } from 'node:test'
import assert from 'node:assert/strict'
import DHT from 'hyperdht'
import { LINDA_BOOTSTRAP_NODE, resolveBootstrap } from '../src/network/swarm.js'

test('without an explicit list, the public nodes come first and ours is added last', () => {
  const list = resolveBootstrap(undefined)
  assert.deepEqual(list.slice(0, DHT.BOOTSTRAP.length), DHT.BOOTSTRAP)
  assert.equal(list.length, DHT.BOOTSTRAP.length + 1)
  assert.equal(list.at(-1), LINDA_BOOTSTRAP_NODE)
})

test('an explicit list is used as given, so tests never reach the public network', () => {
  const testnet = [{ host: '127.0.0.1', port: 1234 }]
  assert.deepEqual(resolveBootstrap(testnet), testnet)
})
