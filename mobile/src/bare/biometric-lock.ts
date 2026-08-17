import * as SecureStore from 'expo-secure-store'

const FLAG_KEY = 'linda-pear-biometric-enabled'
const PASS_KEY = 'linda-pear-unlock-passphrase'

export function isBiometricSupported(): Promise<boolean> {
  return SecureStore.isAvailableAsync()
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(FLAG_KEY)) === '1'
}

/** Seals the passphrase behind the OS keystore, gated by biometric/device-passcode auth on every read. */
export async function enableBiometricLock(passphrase: string): Promise<void> {
  await SecureStore.setItemAsync(PASS_KEY, passphrase, {
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  await SecureStore.setItemAsync(FLAG_KEY, '1')
}

export async function disableBiometricLock(): Promise<void> {
  await SecureStore.deleteItemAsync(PASS_KEY)
  await SecureStore.deleteItemAsync(FLAG_KEY)
}

/** Triggers the OS biometric/passcode prompt; `null` on cancel or failure (caller falls back to manual passphrase entry). */
export async function unlockWithBiometrics(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PASS_KEY, { requireAuthentication: true })
  } catch {
    return null
  }
}
