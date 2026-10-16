import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORIES, findCategory, normalizeExt, outputsFor } from './formats.js';
import { convert, isEngineAvailable } from './convert.js';
import { JobQueue, publicJob } from './jobs.js';
import { sanitizeOptions } from './options.js';
import { AUDIO_BITRATES, HEIGHTS, MEDIA_PRESETS } from './presets.js';
import { tools } from './tools.js';
import { DATA_DIR, OUTPUTS_DIR, PUBLIC_DIR, UPLOADS_DIR } from './paths.js';

const HOST = '127.0.0.1'; // solo accesible desde este PC
const PORT = Number(process.env.PORT) || 3210;
const CONCURRENCY = Number(process.env.CONCURRENCY) || 2;
const MAX_FILE_BYTES = 4 * 1024 ** 3;
const OUTPUT_TTL_MS = 60 * 60 * 1000;
const SSE_PING_MS = 25 * 1000;

mkdirSync(UPLOADS_DIR, { recursive: true });
mkdirSync(OUTPUTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_FILE_BYTES },
});

const extOf = (name) => path.extname(name).slice(1).toLowerCase();

// Nombre de salida seguro para Windows conservando acentos y espacios.
const safeBaseName = (name) => path.parse(name).name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'archivo';

const queue = new JobQueue({
  concurrency: CONCURRENCY,
  storeFile: path.join(DATA_DIR, 'jobs.json'),
  worker: async (job, { signal, onProgress }) => {
    const category = CATEGORIES.find((c) => c.id === job.category);
    await mkdir(job.outputDir, { recursive: true });
    await convert({
      category,
      input: job.input,
      output: job.outputPath,
      sourceExt: job.sourceExt,
      target: job.target,
      options: job.options,
      signal,
      onProgress,
    });
    const { size } = await stat(job.outputPath);
    job.output = { filename: path.basename(job.outputPath), size };
  },
});
await queue.load();

const app = express();
app.use(express.static(PUBLIC_DIR));

app.get('/api/formats', (_req, res) => {
  res.json({
    tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, Boolean(v)])),
    categories: CATEGORIES.map((c) => ({ ...c, available: isEngineAvailable(c.engine) })),
    presets: MEDIA_PRESETS,
    heights: HEIGHTS,
    audioBitrates: AUDIO_BITRATES,
  });
});

app.get('/api/jobs', (_req, res) => {
  res.json(queue.list().map(publicJob));
});

app.post('/api/jobs', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No llegó ningún archivo' });

  const fail = async (status, error) => {
    await rm(file.path, { force: true });
    res.status(status).json({ error });
  };

  const originalName = file.originalname;
  const sourceExt = extOf(originalName);
  const target = String(req.body.target ?? '').toLowerCase();
  const category = findCategory(sourceExt);

  if (!category) return fail(400, `Formato .${sourceExt || '?'} no soportado`);
  if (!outputsFor(sourceExt).includes(target)) return fail(400, `No se puede convertir .${sourceExt} a .${target}`);
  if (!isEngineAvailable(category.engine)) return fail(503, `Falta instalar ${category.engine} para este tipo de archivo`);

  let options;
  try {
    options = sanitizeOptions(JSON.parse(req.body.options || '{}'), category);
  } catch (err) {
    return fail(400, err instanceof SyntaxError ? 'Opciones con formato inválido' : err.message);
  }

  const id = randomUUID();
  const outputDir = path.join(OUTPUTS_DIR, id);
  const job = queue.add({
    id,
    originalName,
    category: category.id,
    sourceExt: normalizeExt(sourceExt),
    target,
    options,
    input: file.path,
    outputDir,
    outputPath: path.join(outputDir, `${safeBaseName(originalName)}.${target}`),
  });
  res.status(201).json(publicJob(job));
});

// Quita un trabajo: si está en cola o corriendo, lo cancela.
app.delete('/api/jobs/:id', async (req, res) => {
  const removed = await queue.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Trabajo no encontrado' });
  res.status(204).end();
});

// Avisos en vivo (Server-Sent Events) de progreso y cambios de estado.
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const onUpdate = (job) => send('update', job);
  const onRemoved = (id) => send('removed', { id });
  queue.on('update', onUpdate);
  queue.on('removed', onRemoved);
  const ping = setInterval(() => res.write(': ping\n\n'), SSE_PING_MS);
  req.on('close', () => {
    clearInterval(ping);
    queue.off('update', onUpdate);
    queue.off('removed', onRemoved);
  });
});

app.get('/api/download/:id', (req, res) => {
  const job = queue.get(req.params.id);
  if (!job || job.status !== 'done') {
    return res.status(404).json({ error: 'El archivo ya no existe (se borran a la hora)' });
  }
  res.download(job.outputPath, job.output.filename);
});

app.use((err, _req, res, _next) => {
  const status = err instanceof multer.MulterError ? 400 : 500;
  res.status(status).json({ error: err.message });
});

// Borra resultados viejos para que el disco no se llene.
setInterval(() => queue.cleanup(OUTPUT_TTL_MS).catch(() => {}), 10 * 60 * 1000).unref();

app.listen(PORT, HOST, () => {
  console.log(`Convertidor listo en http://localhost:${PORT} (${CONCURRENCY} conversiones a la vez)`);
  for (const [name, found] of Object.entries(tools)) {
    console.log(`  ${found ? '✔' : '✘'} ${name}${found ? '' : ' (no encontrado: sus formatos quedan desactivados)'}`);
  }
});
