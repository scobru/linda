import crasher from 'pear-crasher'
import pipe from 'pear-pipe'
import { WorkerDispatcher } from './dispatcher.js'

declare const Bare: {
  on(event: string, listener: (...args: any[]) => void): void
}

if (typeof Pear !== 'undefined' && Pear.config?.storage) {
  crasher('linda-worker', Pear.config.storage, true)
} else if (typeof Bare !== 'undefined') {
  Bare.on('uncaughtException', (err: Error) => {
    console.error('[worker] uncaught exception:', err?.stack || err)
  })
  Bare.on('unhandledRejection', (err: Error) => {
    console.error('[worker] unhandled rejection:', err?.stack || err)
  })
}


// In Bare, pear-pipe() connects to stdio[3] established by pear-run
const stream = pipe()
if (stream) {
  new WorkerDispatcher(stream as any)
}
