// Linda DHT node, meant to run on a public VPS and be listed as an extra bootstrap entry.
// Unlike HyperDHT.bootstrapper() (which starts with an empty routing table and forms its own
// network), this joins the public DHT through the default bootstrap nodes, so a client that
// asks it for peers gets real answers.
//
//   node node.mjs --host <public ipv4> [--port 49737]
//   DHT_BOOTSTRAP=ip:port,ip:port  overrides the nodes it joins through (used by the test)
import HyperDHT from 'hyperdht'

const arg = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 ? process.argv[i + 1] : undefined
}

const host = arg('host')
if (!host) throw new Error('usage: node node.mjs --host <public ipv4> [--port 49737]')
const port = Number(arg('port') || 49737)
const bootstrap = process.env.DHT_BOOTSTRAP ? process.env.DHT_BOOTSTRAP.split(',') : undefined

const dht = new HyperDHT({ host, port, anyPort: false, firewalled: false, bootstrap })
await dht.ready()
console.log('linda dht node on', dht.address(), 'ephemeral:', dht.ephemeral)

process.once('SIGINT', () => dht.destroy())
process.once('SIGTERM', () => dht.destroy())
