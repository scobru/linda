import hypercoreCrypto from 'hypercore-crypto'
import b4a from 'b4a'

/** Fixed rendezvous topic every instance of the app joins so peers can discover each other for the public room directory and online-user search, without needing a shared room. */
export const LOBBY_TOPIC = hypercoreCrypto.discoveryKey(hypercoreCrypto.hash(b4a.from('linda-pear-public-lobby-v1', 'utf8')))
