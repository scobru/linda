import { bareClient } from './client'
import type { CallSignalMessage } from '@core/network/encoding'

export function listConnectedPeerIds(): Promise<string[]> {
  return bareClient.call('session.listConnectedPeerIds')
}

export function sendCallSignal(targetUserId: string, message: CallSignalMessage): Promise<void> {
  return bareClient.call('session.sendCallSignal', targetUserId, message)
}

export function onCallSignal(listener: (message: CallSignalMessage) => void): () => void {
  return bareClient.on('callSignal', listener)
}
