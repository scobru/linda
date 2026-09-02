import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomId } from '../util/id.js'
import { createMediaHandler, mediaPath, type MediaSource } from './media-server.js'

/**
 * The `node:http` half of the local media server, for the Electron desktop app. Mobile runs the
 * same handler behind `bare-http1` inside the worklet instead — see `mobile/worklet/entry.ts`.
 *
 * Bound to loopback on an ephemeral port, started lazily the first time something is played, so
 * a session that never opens media never opens a socket either.
 */
export class LocalMediaServer {
  private constructor(
    private readonly server: http.Server,
    private readonly token: string,
    readonly port: number
  ) {}

  static async start(source: MediaSource): Promise<LocalMediaServer> {
    const token = randomId()
    const handle = createMediaHandler(source, token)

    const server = http.createServer((req, res) => {
      handle(req.url ?? '', req.headers.range).then((response) => {
        res.writeHead(response.status, response.headers)
        if (!response.stream) return res.end()
        response.stream.pipe(res)
        // A player abandons its current range the instant the user seeks, and the socket closes
        // under us. Without this the drive read carries on pulling blocks from peers to feed a
        // response nobody is reading any more — every seek would leak one.
        res.on('close', () => response.stream?.destroy())
      }).catch(() => {
        res.writeHead(500)
        res.end()
      })
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    return new LocalMediaServer(server, token, (server.address() as AddressInfo).port)
  }

  /** Playable URL for a file on any drive this session can reach. */
  url(driveKey: string, filePath: string): string {
    return `http://127.0.0.1:${this.port}${mediaPath(this.token, driveKey, filePath)}`
  }

  close(): void {
    try {
      this.server.closeAllConnections?.()
    } catch {}
    this.server.close()
  }
}
