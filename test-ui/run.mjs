// Runs the UI smoke test, under xvfb-run on a Linux machine that has no display.
import { spawnSync } from 'node:child_process'

const test = ['node', '--test', 'test-ui/smoke.test.mjs']
const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
const [command, ...args] = needsXvfb ? ['xvfb-run', '-a', ...test] : test

const result = spawnSync(command, args, { stdio: 'inherit' })
if (result.error) {
  console.error(`could not run ${command}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
