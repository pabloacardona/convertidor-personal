import { tools } from './tools.js';
import { convertImage } from './converters/image.js';
import { convertMedia } from './converters/media.js';
import { convertWithLibreOffice, convertWithPandoc } from './converters/document.js';

export const isEngineAvailable = (engine) => Boolean(tools[engine]);

const CONVERTERS = {
  sharp: convertImage,
  ffmpeg: convertMedia,
  libreoffice: convertWithLibreOffice,
  pandoc: convertWithPandoc,
};

// task: { category, input, output, sourceExt, target, options, signal, onProgress }
export async function convert(task) {
  const converter = CONVERTERS[task.category.engine];
  if (!converter) throw new Error(`Motor desconocido: ${task.category.engine}`);
  return converter(task);
}
