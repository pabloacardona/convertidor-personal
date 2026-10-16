import { tools } from './tools.js';
import { convertImage } from './converters/image.js';
import { convertMedia } from './converters/media.js';
import { convertWithLibreOffice, convertWithPandoc } from './converters/document.js';

export const isEngineAvailable = (engine) => Boolean(tools[engine]);

export async function convert({ category, input, output, sourceExt, target, quality }) {
  switch (category.engine) {
    case 'sharp':
      return convertImage(input, output, target, { quality });
    case 'ffmpeg':
      return convertMedia(input, output, target);
    case 'libreoffice':
      return convertWithLibreOffice(input, output, target);
    case 'pandoc':
      return convertWithPandoc(input, output, target, sourceExt);
    default:
      throw new Error(`Motor desconocido: ${category.engine}`);
  }
}
