declare const Pear: {
  config: {
    storage: string
    name: string
  }
  restart?(): Promise<void> | void
  exit?(code?: number): void
}

declare module 'pear-pipe' {
  import type { Duplex } from 'streamx'
  export default function pipe(): Duplex | null
}

declare module 'pear-run' {
  import type { Duplex } from 'streamx'
  export default function run(link: string, args?: string[]): Duplex
}

declare module 'pear-updates' {
  export interface PearUpdate {
    app?: boolean
    version?: string
    info?: unknown
    updating?: boolean
    updated?: boolean
  }
  export interface UpdatesStream {
    on(event: 'data', listener: (update: PearUpdate) => void): this
    destroy(): void
  }
  export default function updates(
    patternOrListener?: ((update: PearUpdate) => void) | { app?: boolean; updating?: boolean; updated?: boolean },
    listener?: (update: PearUpdate) => void
  ): UpdatesStream
}

declare module 'pear-wakeups' {
  export interface PearWakeup {
    link?: string
    applink?: string
    entrypoint?: string
    fragment?: string
    query?: unknown
    linkData?: unknown
  }
  export interface WakeupsStream {
    on(event: 'data', listener: (wakeup: PearWakeup) => void): this
    destroy(): void
  }
  export default function wakeups(
    patternOrListener?: ((wakeup: PearWakeup) => void) | Record<string, unknown>,
    listener?: (wakeup: PearWakeup) => void
  ): WakeupsStream
}

