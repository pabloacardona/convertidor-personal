import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';

const ACTIVE = new Set(['queued', 'running']);
const PROGRESS_EMIT_MS = 250;

const PUBLIC_FIELDS = [
  'id', 'originalName', 'category', 'target', 'options', 'status',
  'progress', 'error', 'output', 'createdAt', 'startedAt', 'finishedAt',
];

// Lo que ve el navegador: sin rutas internas del disco.
export const publicJob = (job) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, job[k] ?? null]));

// Cola de conversiones con concurrencia limitada, cancelación y persistencia en disco.
// Eventos: 'update' (job público) y 'removed' (id).
export class JobQueue extends EventEmitter {
  #jobs = new Map();
  #running = new Map();
  #saving = Promise.resolve();

  constructor({ concurrency, storeFile, worker }) {
    super();
    this.setMaxListeners(0);
    this.concurrency = concurrency;
    this.storeFile = storeFile;
    this.worker = worker;
  }

  // Recupera la cola tras un reinicio: lo que estaba a medias vuelve a la cola.
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.storeFile, 'utf8'));
      for (const job of saved) {
        if (ACTIVE.has(job.status)) {
          if (existsSync(job.input)) Object.assign(job, { status: 'queued', progress: 0, startedAt: null });
          else Object.assign(job, { status: 'error', error: 'El archivo original se perdió al reiniciar', finishedAt: Date.now() });
        }
        if (job.status === 'done' && !existsSync(job.outputPath)) continue;
        this.#jobs.set(job.id, job);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[cola] no se pudo leer el estado guardado:', err.message);
    }
    this.#pump();
  }

  add(fields) {
    const job = {
      ...fields,
      status: 'queued',
      progress: 0,
      error: null,
      output: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    this.#jobs.set(job.id, job);
    this.#changed(job);
    this.#pump();
    return job;
  }

  get(id) {
    return this.#jobs.get(id);
  }

  list() {
    return [...this.#jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  // Cancela si está activo y borra el trabajo con sus archivos.
  async remove(id) {
    const job = this.#jobs.get(id);
    if (!job) return false;
    this.#jobs.delete(id);
    // Windows no deja borrar archivos abiertos: primero se espera a que el proceso muera.
    const running = this.#running.get(id);
    if (running) {
      running.controller.abort();
      await running.finished;
    }
    await Promise.all([rm(job.input, { force: true }), rm(job.outputDir, { recursive: true, force: true })]);
    this.emit('removed', id);
    this.#save();
    this.#pump();
    return true;
  }

  // Borra trabajos terminados hace más de `ttlMs`.
  async cleanup(ttlMs) {
    const now = Date.now();
    const old = this.list().filter((j) => !ACTIVE.has(j.status) && now - j.finishedAt > ttlMs);
    for (const job of old) await this.remove(job.id);
  }

  #pump() {
    while (this.#running.size < this.concurrency) {
      const next = this.list().find((j) => j.status === 'queued');
      if (!next) return;
      this.#start(next);
    }
  }

  #start(job) {
    const controller = new AbortController();
    const finished = this.#execute(job, controller);
    this.#running.set(job.id, { controller, finished });
  }

  async #execute(job, controller) {
    Object.assign(job, { status: 'running', startedAt: Date.now() });
    this.#changed(job);

    let lastEmit = 0;
    const onProgress = (p) => {
      job.progress = p;
      const now = Date.now();
      if (now - lastEmit < PROGRESS_EMIT_MS) return;
      lastEmit = now;
      this.emit('update', publicJob(job));
    };

    try {
      await this.worker(job, { signal: controller.signal, onProgress });
      Object.assign(job, { status: 'done', progress: 1 });
    } catch (err) {
      Object.assign(job, controller.signal.aborted
        ? { status: 'canceled', error: null }
        : { status: 'error', error: err.message });
    } finally {
      this.#running.delete(job.id);
      job.finishedAt = Date.now();
      await rm(job.input, { force: true });
      if (job.status !== 'done') await rm(job.outputDir, { recursive: true, force: true });
      // Si lo borraron mientras corría, no se vuelve a anunciar.
      if (this.#jobs.has(job.id)) this.#changed(job);
      this.#pump();
    }
  }

  #changed(job) {
    this.emit('update', publicJob(job));
    this.#save();
  }

  // Escrituras en serie y atómicas (archivo temporal + rename).
  #save() {
    const snapshot = JSON.stringify(this.list(), null, 2);
    const tmp = `${this.storeFile}.tmp`;
    this.#saving = this.#saving
      .then(() => writeFile(tmp, snapshot))
      .then(() => rename(tmp, this.storeFile))
      .catch((err) => console.warn('[cola] no se pudo guardar el estado:', err.message));
  }
}
