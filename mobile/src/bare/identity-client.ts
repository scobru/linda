import { bareClient } from './client'

export interface Identity {
  id: string
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('wrong passphrase')
  }
}

export function identityExists(dir: string): Promise<boolean> {
  return bareClient.call('identity.exists', dir)
}

export async function createIdentity(passphrase: string, dir: string): Promise<{ identity: Identity; mnemonic: string }> {
  const { id, mnemonic } = await bareClient.call<{ id: string; mnemonic: string }>('identity.create', passphrase, dir)
  return { identity: { id }, mnemonic }
}

export async function unlockIdentity(passphrase: string, dir: string): Promise<Identity> {
  try {
    const { id } = await bareClient.call<{ id: string }>('identity.unlock', passphrase, dir)
    return { id }
  } catch (err) {
    if ((err as Error).message === 'wrong passphrase') throw new WrongPassphraseError()
    throw err
  }
}

export async function recoverIdentity(mnemonic: string, passphrase: string, dir: string): Promise<Identity> {
  const { id } = await bareClient.call<{ id: string }>('identity.recover', mnemonic, passphrase, dir)
  return { id }
}

export function validateMnemonic(mnemonic: string): Promise<boolean> {
  return bareClient.call('identity.validateMnemonic', mnemonic)
}

export function revealSecretKey(): Promise<string> {
  return bareClient.call('identity.revealSecretKey')
}

export function revealMnemonic(passphrase: string, dir: string): Promise<string | null> {
  return bareClient.call('identity.revealMnemonic', passphrase, dir)
}

export function resetDevice(dir: string): Promise<void> {
  return bareClient.call('identity.resetDevice', dir)
}

export async function pairAndSave(code: string, passphrase: string, dir: string): Promise<Identity> {
  const { id } = await bareClient.call<{ id: string }>('identity.pair', code, passphrase, dir)
  return { id }
}

/**
 * Hosts a pairing so another device can adopt this one's identity — the half the desktop has
 * always had. Resolves once the code exists (show it as a QR); `onPaired` fires later, when the
 * other device has actually taken it. Call the returned function to stop hosting.
 */
export async function startHostedPairing(
  onCode: (code: string) => void,
  onPaired: () => void
): Promise<() => void> {
  const offCode = bareClient.on('pairingCode', (payload: { code: string }) => onCode(payload.code))
  const offDone = bareClient.on('pairingDone', () => onPaired())
  try {
    await bareClient.call('identity.hostPairing')
  } catch (err) {
    offCode()
    offDone()
    throw err
  }
  return () => {
    offCode()
    offDone()
    void bareClient.call('identity.stopPairing').catch(() => { /* already torn down */ })
  }
}
