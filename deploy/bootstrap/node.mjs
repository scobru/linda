// Linda DHT node, meant to run on a public VPS and be listed as an extra bootstrap entry.
// Unlike HyperDHT.bootstrapper() (which starts with an empty routing table and forms its own
// network), this joins the public DHT through the default bootstrap nodes, so a client that
// asks it for peers gets real answers.
//
//   node node.mjs [--port 49737]      (or env DHT_PORT, for containers)
//   DHT_BOOTSTRAP=ip:port,ip:port  overrides the nodes it joins through (used by the test)
//
// It binds 0.0.0.0 and learns its public address from the nodes it talks to. Do not pass the
// public IP as hyperdht's `host` option: that is the address to bind, and inside Docker (or any
// NAT) the public IP is not on the interface, so bind fails with EADDRNOTAVAIL.
import HyperDHT from 'hyperdht'

const arg = (name) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 ? process.argv[i + 1] : undefined
}

const port = Number(arg('port') || process.env.DHT_PORT || 49737)
const bootstrap = process.env.DHT_BOOTSTRAP ? process.env.DHT_BOOTSTRAP.split(',') : undefined

const dht = new HyperDHT({ port, anyPort: false, firewalled: false, bootstrap })
await dht.ready()
console.log('linda dht node on', dht.address(), 'ephemeral:', dht.ephemeral)
// Only now does the node count as reachable: until this line shows up it is not serving as bootstrap.
dht.on('persistent', () => console.log('persistent: reachable, serving as a bootstrap node'))

process.once('SIGINT', () => dht.destroy())
process.once('SIGTERM', () => dht.destroy())
