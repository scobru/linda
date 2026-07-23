import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure a default port is configured in the environment so spawned processes inherit it
process.env.PORT = process.env.PORT || '5173';

console.log(`Starting Linda in development mode (port ${process.env.PORT})...`);

// Start Vite dev server
const viteProcess = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

// Start Electron after a 3-second delay to let Vite spin up
const delay = 3000;
const timer = setTimeout(() => {
  console.log('Launching Electron window...');
  
  const electronProcess = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  // When Electron is closed, terminate the Vite dev server and exit
  electronProcess.on('close', (code) => {
    console.log(`Electron closed with code ${code}. Stopping Vite...`);
    viteProcess.kill('SIGINT');
    process.exit(code || 0);
  });

  electronProcess.on('error', (err) => {
    console.error('Failed to start Electron:', err);
    viteProcess.kill('SIGINT');
    process.exit(1);
  });
}, delay);

// Clean up processes on exit
process.on('SIGINT', () => {
  clearTimeout(timer);
  viteProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearTimeout(timer);
  viteProcess.kill('SIGTERM');
  process.exit(0);
});
