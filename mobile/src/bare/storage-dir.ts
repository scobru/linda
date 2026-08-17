import * as FileSystem from 'expo-file-system'

/** Real per-app sandboxed storage dir, as a plain filesystem path bare-fs can use directly (strips the file:// prefix expo-file-system returns). */
export function storageDir(): string {
  const dir = FileSystem.documentDirectory ?? ''
  return dir.replace(/^file:\/\//, '') + 'linda-pear-storage'
}
