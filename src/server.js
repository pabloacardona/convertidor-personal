import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORIES, findCategory, normalizeExt, outputsFor } from './formats.js';
import { convert, isEngineAvailable } from './convert.js';
import { tools } from './tools.js';
import { OUTPUTS_DIR, PUBLIC_DIR, UPLOADS_DIR } from './paths.js';

const HOST = '127.0.0.1'; // solo accesible desde este PC
const PORT = Number(process.env.PORT) || 3210;
const MAX_FILE_BYTES = 4 * 1024 ** 3;
const OUTPUT_TTL_MS = 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f-]{36}$/;

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

const app = express();
app.use(express.static(PUBLIC_DIR));

app.get('/api/formats', (_req, res) => {
  res.json({
    tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, Boolean(v)])),
    categories: CATEGORIES.map((c) => ({ ...c, available: isEngineAvailable(c.engine) })),
  });
});

app.post('/api/convert', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No llegó ningún archivo' });

  const originalName = file.originalname;
  const sourceExt = extOf(originalName);
  const target = String(req.body.target ?? '').toLowerCase();
  const category = findCategory(sourceExt);

  const fail = async (status, error) => {
    await rm(file.path, { force: true });
    res.status(status).json({ error });
  };

  if (!category) return fail(400, `Formato .${sourceExt || '?'} no soportado`);
  if (!outputsFor(sourceExt).includes(target)) return fail(400, `No se puede convertir .${sourceExt} a .${target}`);
  if (!isEngineAvailable(category.engine)) return fail(503, `Falta instalar ${category.engine} para este tipo de archivo`);

  const quality = req.body.quality ? Math.min(100, Math.max(1, Number(req.body.quality))) : undefined;
  const id = randomUUID();
  const outDir = path.join(OUTPUTS_DIR, id);
  const filename = `${safeBaseName(originalName)}.${target}`;
  const output = path.join(outDir, filename);

  try {
    await mkdir(outDir, { recursive: true });
    const started = Date.now();
    await convert({ category, input: file.path, output, sourceExt: normalizeExt(sourceExt), target, quality });
    const { size } = await stat(output);
    res.json({ id, filename, size, ms: Date.now() - started });
  } catch (err) {
    console.error(`[error] ${originalName} -> ${target}:`, err.message);
    await rm(outDir, { recursive: true, force: true });
    res.status(500).json({ error: err.message });
  } finally {
    await rm(file.path, { force: true });
  }
});

app.get('/api/download/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'ID inválido' });
  const outDir = path.join(OUTPUTS_DIR, id);
  try {
    const [filename] = await readdir(outDir);
    if (!filename) throw new Error('vacío');
    res.download(path.join(outDir, filename), filename);
  } catch {
    res.status(404).json({ error: 'El archivo ya no existe (se borran a la hora)' });
  }
});

app.use((err, _req, res, _next) => {
  const status = err instanceof multer.MulterError ? 400 : 500;
  res.status(status).json({ error: err.message });
});

// Borra resultados viejos para que el disco no se llene.
async function cleanOldOutputs() {
  const now = Date.now();
  for (const dir of await readdir(OUTPUTS_DIR)) {
    const full = path.join(OUTPUTS_DIR, dir);
    const { mtimeMs } = await stat(full).catch(() => ({ mtimeMs: now }));
    if (now - mtimeMs > OUTPUT_TTL_MS) await rm(full, { recursive: true, force: true });
  }
}
setInterval(() => cleanOldOutputs().catch(() => {}), 10 * 60 * 1000).unref();

app.listen(PORT, HOST, () => {
  console.log(`Convertidor listo en http://localhost:${PORT}`);
  for (const [name, found] of Object.entries(tools)) {
    console.log(`  ${found ? '✔' : '✘'} ${name}${found ? '' : ' (no encontrado: sus formatos quedan desactivados)'}`);
  }
});
