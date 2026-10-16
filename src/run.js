import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// Ejecuta un programa externo y falla con las últimas líneas de stderr.
// `signal` permite cancelarlo; `onStdout`/`onStderr` reciben la salida en vivo.
export function run(cmd, args, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, onStdout, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stdout.on('data', (chunk) => onStdout?.(chunk.toString()));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-4000);
      onStderr?.(text);
    });

    const kill = () => child.kill('SIGKILL');
    const timer = setTimeout(kill, timeoutMs);
    if (signal?.aborted) kill();
    signal?.addEventListener('abort', kill, { once: true });

    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', kill);
    };
    child.on('error', (err) => {
      finish();
      reject(err);
    });
    child.on('close', (code) => {
      finish();
      if (signal?.aborted) return reject(new Error('Cancelado'));
      if (code === 0) return resolve();
      const tail = stderr.trim().split(/\r?\n/).slice(-3).join(' | ');
      const name = cmd.split(/[\\/]/).pop();
      reject(new Error(`${name} terminó con código ${code}${tail ? `: ${tail}` : ''}`));
    });
  });
}
