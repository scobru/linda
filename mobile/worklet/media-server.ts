import http from 'bare-http1'
import { createMediaHandler, mediaPath, type MediaSource } from '../../src/files/media-server.js'
import { randomId } from '../../src/util/id.js'

/**
 * The Bare half of the local media server — same handler as the desktop's `LocalMediaServer`,
 * different HTTP implementation, because the Bare runtime has `bare-http1` where Electron has
 * `node:http`.
 *
 * It runs inside the worklet, which is where the session and its drives already live; the RN
 * side only ever receives a URL and hands it to a native player. That is the whole point of
 * doing it this way: nothing has to cross the IPC bridge except the address, instead of the
 * file's bytes as base64.
 */
export class WorkletMediaServer {
  private constructor(private readonly token: string, readonly port: number) {}

  static async start(source: MediaSource): Promise<WorkletMediaServer> {
    const token = randomId()
    const handle = createMediaHandler(source, token)

    const server = http.createServer((req, res) => {
      handle(req.url ?? '', req.headers.range).then((response) => {
        res.writeHead(response.status, response.headers)
        if (!response.stream) return res.end()
        response.stream.pipe(res)
        // Seeking abandons the current range mid-flight; without this the drive keeps pulling
        // blocks from peers to fill a response that nothing is reading.
        res.on('close', () => response.stream?.destroy())
      }).catch(() => {
        res.writeHead(500)
        res.end()
      })
    })

    const port = await new Promise<number>((resolve, reject) => {
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => resolve(server.address().port))
    })

    return new WorkletMediaServer(token, port)
  }

  url(driveKey: string, filePath: string): string {
    return `http://127.0.0.1:${this.port}${mediaPath(this.token, driveKey, filePath)}`
  }
}
