declare const Pear: {
  config: {
    storage: string
    name: string
  }
}

declare module 'pear-pipe' {
  import type { Duplex } from 'streamx'
  export default function pipe(): Duplex | null
}

declare module 'pear-run' {
  import type { Duplex } from 'streamx'
  export default function run(link: string, args?: string[]): Duplex
}
