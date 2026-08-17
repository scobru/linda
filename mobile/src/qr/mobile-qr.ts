/**
 * Mobile QR implementation — replaces desktop's canvas/File-based qr.ts.
 * Uses expo-camera for live scanning and react-native-qrcode-svg for rendering.
 *
 * Re-exports the platform-agnostic encode/decode from qr-core.
 */

export { encodeInvite, decodeInvite, type RoomInvite } from '@core/ui/qr-core'
