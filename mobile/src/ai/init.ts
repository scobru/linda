import * as SecureStore from 'expo-secure-store'
import { aiAgentStore } from '@core/ai/agent-store'

aiAgentStore.setAdapter({
  async getItem(key: string) {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      // Ignore secure store write failure
    }
  }
})
