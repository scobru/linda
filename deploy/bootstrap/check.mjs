// Checks a bootstrap node from the outside: bootstrap from it alone and see if it answers with
// other nodes. Run it from a machine that is not the node's host, and not on its LAN.
//   node check.mjs <ip>@<host>:49737
import HyperDHT from 'hyperdht'

const node = process.argv[2]
if (!node) throw new Error('usage: node check.mjs <ip>@<host>:<port>')
const waitMs = Number(process.env.CHECK_TIMEOUT_MS || 20000)

const dht = new HyperDHT({ bootstrap: [node] })
const timeout = new Promise((resolve) => setTimeout(resolve, waitMs))
await Promise.race([dht.fullyBootstrapped(), timeout])

const learned = dht.table.size
console.log(learned > 0 ? `OK: learned ${learned} nodes through ${node}` : `FAIL: no answer from ${node} within ${waitMs / 1000}s (UDP blocked, wrong port or node down)`)
await dht.destroy()
process.exit(learned > 0 ? 0 : 1)
