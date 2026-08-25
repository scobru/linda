/** Minimal surface of `bare-http1` — the Bare runtime's HTTP/1 server, which ships no types.
 * Only what `media-server.ts` uses. */
declare module 'bare-http1' {
  import type { Readable, Writable } from 'node:stream'

  interface IncomingMessage extends Readable {
    url?: string
    method?: string
    headers: Record<string, string | undefined>
  }

  interface ServerResponse extends Writable {
    writeHead(status: number, headers?: Record<string, string>): void
    end(data?: unknown): void
    on(event: 'close', listener: () => void): this
  }

  interface Server {
    listen(port: number, host: string, onListening: () => void): void
    address(): { port: number; host: string }
    on(event: 'error', listener: (err: Error) => void): this
    close(): void
  }

  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server

  const http: { createServer: typeof createServer }
  export default http
}
