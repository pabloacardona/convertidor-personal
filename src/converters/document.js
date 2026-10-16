import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tools } from '../tools.js';
import { run } from '../run.js';
import { DATA_DIR } from '../paths.js';

// Perfil propio para no chocar con un LibreOffice abierto por el usuario.
const PROFILE_DIR = path.join(DATA_DIR, 'lo-profile');

// LibreOffice no tolera conversiones en paralelo con el mismo perfil: se encolan.
let queue = Promise.resolve();

export function convertWithLibreOffice({ input, output, target, signal }) {
  const job = queue.then(async () => {
    if (!tools.libreoffice) throw new Error('LibreOffice no está instalado');
    if (signal?.aborted) throw new Error('Cancelado');
    await mkdir(PROFILE_DIR, { recursive: true });
    const outDir = path.dirname(output);
    await run(tools.libreoffice, [
      `-env:UserInstallation=${pathToFileURL(PROFILE_DIR).href}`,
      '--headless',
      '--convert-to', target,
      '--outdir', outDir,
      input,
    ], { signal });
    // LibreOffice nombra la salida como la entrada con otra extensión.
    await rename(path.join(outDir, `${path.parse(input).name}.${target}`), output);
  });
  queue = job.catch(() => {});
  return job;
}

const PANDOC_FROM = { md: 'markdown', html: 'html', epub: 'epub', rst: 'rst', tex: 'latex' };
const PANDOC_TO = { md: 'gfm', html: 'html', docx: 'docx', odt: 'odt', epub: 'epub', rst: 'rst' };

export async function convertWithPandoc({ input, output, target, sourceExt, signal }) {
  if (!tools.pandoc) throw new Error('Pandoc no está instalado');
  const args = [input, '-f', PANDOC_FROM[sourceExt], '-t', PANDOC_TO[target], '-o', output];
  if (target === 'html') args.push('--standalone');
  await run(tools.pandoc, args, { signal });
}
