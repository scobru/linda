// Things the shell asks the browser or its host to do.
import { desktopHost } from './desktop-host.js'

export function triggerBlobDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Each host has its own least-broken way to write the clipboard — see desktop-host.ts. */
export function copyToClipboard(text: string): void {
  desktopHost().copyToClipboard(text)
}
