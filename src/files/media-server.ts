import type { Readable } from 'node:stream'
import { planRange, rangeHeaders, mimeFromName } from './media-range.js'

/**
 * Runtime-agnostic half of the local media server: URL in, status/headers/stream out.
 *
 * It exists apart from any actual HTTP server because the two runtimes that need one have
 * nothing in common — Electron's renderer has `node:http`, the Bare worklet on mobile has
 * `bare-http1` — while the part worth getting right is identical on both.
 */

/** The slice of `Session` this needs. Narrow on purpose: the handler is then testable against
 * a plain object, with no corestore in sight. */
export interface MediaSource {
  statFile(driveKey: string, filePath: string): Promise<{ size: number } | null>
  createFileStream(driveKey: string, filePath: string, range?: { start: number; end: number }): Promise<Readable>
}

/** A running loopback media server, as its owner sees it. */
export interface MediaServerHandle {
  url(driveKey: string, filePath: string): string
  close(): void
}

/**
 * Starts one. Injected into `Session` rather than imported by it, for the same reason
 * `SwarmTransport.createLanDiscovery` is: the only implementation that speaks `node:http`
 * (`media-server-node.ts`) must stay out of the mobile worklet's module graph, where Bare has no
 * `node:http` and `bare-pack` fails on the traverse rather than at runtime. The worklet runs its
 * own server on `bare-http1` instead (`mobile/worklet/media-server.ts`).
 */
export type MediaServerFactory = (source: MediaSource) => Promise<MediaServerHandle>

export interface MediaResponse {
  status: number
  headers: Record<string, string>
  /** Absent when there is nothing to send: an unknown path, or a range past the end. */
  stream?: Readable
}

/**
 * `/<token>/<driveKey>/<url-encoded drive path>`.
 *
 * The token is a per-session secret: the server listens on loopback, but loopback is shared
 * with every other process on the machine, including a browser that a malicious page is
 * driving. Without it, anything that could guess the port could read any file this peer can.
 */
export function mediaPath(token: string, driveKey: string, filePath: string): string {
  return `/${token}/${driveKey}/${encodeURIComponent(filePath)}`
}

const NOT_FOUND: MediaResponse = { status: 404, headers: { 'Content-Type': 'text/plain' } }

export function createMediaHandler(source: MediaSource, token: string) {
  return async function handleMediaRequest(url: string, rangeHeader?: string): Promise<MediaResponse> {
    const [, urlToken, driveKey, encodedPath] = (url.split('?')[0] ?? '').split('/')
    // A bad token gets the same 404 as a bad path, so probing cannot tell the two apart.
    if (urlToken !== token) return NOT_FOUND
    if (!driveKey || !/^[0-9a-f]{64}$/.test(driveKey) || !encodedPath) return NOT_FOUND

    let filePath: string
    try {
      filePath = decodeURIComponent(encodedPath)
    } catch {
      return NOT_FOUND
    }

    const stat = await source.statFile(driveKey, filePath).catch(() => null)
    if (!stat) return NOT_FOUND

    const plan = planRange(rangeHeader, stat.size)
    const headers = rangeHeaders(plan, stat.size, mimeFromName(filePath))
    if (plan.status === 416 || stat.size === 0) return { status: plan.status, headers }

    const stream = await source.createFileStream(driveKey, filePath, plan.range)
    return { status: plan.status, headers, stream }
  }
}
