import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// Ejecuta un programa externo y falla con las últimas líneas de stderr.
export function run(cmd, args, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const tail = stderr.trim().split(/\r?\n/).slice(-3).join(' | ');
      const name = cmd.split(/[\\/]/).pop();
      reject(new Error(`${name} terminó con código ${code}${tail ? `: ${tail}` : ''}`));
    });
  });
}
