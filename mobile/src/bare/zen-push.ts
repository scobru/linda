// Temporarily disabled: @akaoio/zen pulls in Node-only internals (child_process, fs, path
// from lib/service.js) that Metro can't bundle for Hermes, breaking release builds. Push
// notifications are best-effort already (call sites treat a null/no-op result as "not
// available"), so stubbing this out just means no wake-on-push for now — chat over
// hyperswarm is unaffected. Re-enable once zen's RN/Metro compat is sorted separately.

export async function registerPushToken(): Promise<string | null> {
  return null
}

export async function notifyOffline(_zenPub: string, _roomId: string): Promise<void> {}
