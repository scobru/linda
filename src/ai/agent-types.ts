export type AIAgentProvider = 'openrouter' | 'ollama' | 'custom'

export interface AIAgentConfig {
  /** Unique agent ID (e.g. agent-172713...) */
  id: string
  /** Display name of the agent (e.g. "Ollama Llama", "Code Mentor") */
  name: string
  /** Provider type */
  provider: AIAgentProvider
  /** Base API endpoint URL (without trailing slash, e.g. "https://openrouter.ai/api/v1" or "http://localhost:11434/v1") */
  baseUrl: string
  /** Model identifier (e.g. "llama3:latest", "meta-llama/llama-3.3-70b-instruct:free") */
  model: string
  /** Optional API Key (for OpenRouter / OpenAI compatible endpoints) */
  apiKey?: string
  /** System prompt defining the persona and instructions */
  systemPrompt: string
  /** Linda room ID bound to this agent */
  roomId: string
  /** Optional avatar emoji or image */
  avatar?: string
  /** Creation timestamp in epoch ms */
  createdAt: number
}

export interface ProviderPreset {
  name: string
  baseUrl: string
  defaultModel: string
  requiresKey: boolean
  description: string
}

export const PROVIDER_PRESETS: Record<AIAgentProvider, ProviderPreset> = {
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3:latest',
    requiresKey: false,
    description: 'Local models running on your machine via Ollama'
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    requiresKey: true,
    description: 'Unified cloud gateway with free and paid LLMs'
  },
  custom: {
    name: 'Custom OpenAI-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
    description: 'Any OpenAI-compatible server (vLLM, LM Studio, etc.)'
  }
}
