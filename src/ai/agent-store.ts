import type { AIAgentConfig } from './agent-types.js'

const STORAGE_KEY = 'linda-ai-agents'

export interface AgentStorageAdapter {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
}

export class AIAgentStore {
  private inMemory = new Map<string, AIAgentConfig>()
  private adapter?: AgentStorageAdapter

  constructor(adapter?: AgentStorageAdapter) {
    if (adapter) this.adapter = adapter
    this.load()
  }

  setAdapter(adapter: AgentStorageAdapter): void {
    this.adapter = adapter
    void this.loadFromAdapter()
  }

  list(): AIAgentConfig[] {
    this.load()
    return [...this.inMemory.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  get(id: string): AIAgentConfig | undefined {
    this.load()
    return this.inMemory.get(id)
  }

  getByRoomId(roomId: string): AIAgentConfig | undefined {
    this.load()
    for (const agent of this.inMemory.values()) {
      if (agent.roomId === roomId) return agent
    }
    return undefined
  }

  save(agent: AIAgentConfig): void {
    this.inMemory.set(agent.id, agent)
    this.persist()
  }

  delete(id: string): boolean {
    const deleted = this.inMemory.delete(id)
    if (deleted) this.persist()
    return deleted
  }

  deleteByRoomId(roomId: string): boolean {
    let deleted = false
    for (const [id, agent] of this.inMemory.entries()) {
      if (agent.roomId === roomId) {
        this.inMemory.delete(id)
        deleted = true
      }
    }
    if (deleted) this.persist()
    return deleted
  }

  private load(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const list = JSON.parse(raw) as AIAgentConfig[]
          if (Array.isArray(list)) {
            this.inMemory.clear()
            for (const item of list) {
              if (item?.id) this.inMemory.set(item.id, item)
            }
          }
        }
      }
    } catch {
      // Fallback to in-memory
    }
  }

  private async loadFromAdapter(): Promise<void> {
    if (!this.adapter) return
    try {
      const raw = await this.adapter.getItem(STORAGE_KEY)
      if (raw) {
        const list = JSON.parse(raw) as AIAgentConfig[]
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item?.id) this.inMemory.set(item.id, item)
          }
        }
      }
    } catch {
      // Ignore adapter load error
    }
  }

  private persist(): void {
    try {
      const arr = [...this.inMemory.values()]
      const serialized = JSON.stringify(arr)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, serialized)
      }
      if (this.adapter) {
        void this.adapter.setItem(STORAGE_KEY, serialized)
      }
    } catch {
      // Ignore in non-browser or storage-restricted contexts
    }
  }
}

export const aiAgentStore = new AIAgentStore()

