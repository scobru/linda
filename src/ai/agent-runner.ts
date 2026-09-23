import type { AIAgentConfig } from './agent-types.js'

export interface ChatMessageContext {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function queryAIAgent(
  agent: AIAgentConfig,
  messages: ChatMessageContext[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const url = agent.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (agent.apiKey) {
    headers.Authorization = `Bearer ${agent.apiKey}`
  }

  // OpenRouter recommended headers
  if (agent.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://linda.chat'
    headers['X-Title'] = 'Linda P2P'
  }

  const payloadMessages: ChatMessageContext[] = []
  if (agent.systemPrompt?.trim()) {
    payloadMessages.push({ role: 'system', content: agent.systemPrompt.trim() })
  }
  payloadMessages.push(...messages)

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: agent.model,
      messages: payloadMessages,
      stream: true
    })
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    let msg = `HTTP ${res.status}: ${res.statusText}`
    try {
      const parsed = JSON.parse(errorText) as { error?: { message?: string } }
      if (parsed.error?.message) msg = parsed.error.message
    } catch {
      if (errorText) msg += ` - ${errorText.slice(0, 150)}`
    }
    throw new Error(`AI Provider Error (${msg})`)
  }

  const contentType = res.headers.get('content-type') || ''

  // Fallback: non-streaming JSON response
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as Record<string, any>
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error))
    }
    const choices = data.choices as Array<Record<string, any>> | undefined
    const text = choices?.[0]?.message?.content
      ?? choices?.[0]?.delta?.content
      ?? choices?.[0]?.text
      ?? data.content
      ?? ''
    if (text && onChunk) onChunk(String(text))
    return String(text)
  }

  const hasReader = typeof (res.body as any)?.getReader === 'function'

  if (hasReader) {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const lineTrimmed = line.trim()
        if (!lineTrimmed) continue

        let dataStr = lineTrimmed
        if (lineTrimmed.startsWith('data:')) {
          dataStr = lineTrimmed.slice(5).trim()
        }
        if (dataStr === '[DONE]') break

        try {
          const parsed = JSON.parse(dataStr) as Record<string, any>
          if (parsed.error) {
            throw new Error(parsed.error.message || JSON.stringify(parsed.error))
          }

          const choices = parsed.choices as Array<Record<string, any>> | undefined
          const choice = choices?.[0]
          const delta = choice?.delta as Record<string, any> | undefined
          const message = choice?.message as Record<string, any> | undefined

          const chunk = delta?.content
            ?? delta?.reasoning_content
            ?? message?.content
            ?? choice?.text
            ?? parsed.content

          if (chunk) {
            const chunkStr = String(chunk)
            fullText += chunkStr
            onChunk?.(chunkStr)
          }
        } catch (err) {
          if ((err as Error).message?.startsWith('AI Provider Error') || (err as Error).message?.includes('error')) {
            throw err
          }
          // Skip non-JSON framing lines
        }
      }
    }

    return fullText.trim()
  }

  // Fallback for runtimes without ReadableStream.getReader() (React Native)
  const rawText = await res.text()
  if (!rawText) return ''

  if (rawText.includes('data:')) {
    const lines = rawText.split('\n')
    let full = ''
    for (const line of lines) {
      const lineTrimmed = line.trim()
      if (!lineTrimmed || !lineTrimmed.startsWith('data:')) continue
      const dataStr = lineTrimmed.slice(5).trim()
      if (dataStr === '[DONE]') break
      try {
        const parsed = JSON.parse(dataStr) as Record<string, any>
        const chunk = parsed.choices?.[0]?.delta?.content
          ?? parsed.choices?.[0]?.message?.content
          ?? ''
        if (chunk) {
          const chunkStr = String(chunk)
          full += chunkStr
          onChunk?.(chunkStr)
        }
      } catch {}
    }
    return full.trim()
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, any>
    const content = parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text ?? rawText
    if (content && onChunk) onChunk(String(content))
    return String(content).trim()
  } catch {
    if (onChunk) onChunk(rawText)
    return rawText.trim()
  }
}
