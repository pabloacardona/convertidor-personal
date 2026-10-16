import sharp from 'sharp';

const SHARP_FORMAT = { jpg: 'jpeg', png: 'png', webp: 'webp', avif: 'avif', gif: 'gif', tiff: 'tiff' };
const LOSSY = new Set(['jpg', 'webp', 'avif', 'tiff']);

export async function convertImage({ input, output, target, options = {} }) {
  // GIF y WebP conservan la animación de la imagen original.
  let img = sharp(input, { animated: target === 'gif' || target === 'webp' });
  // JPG no tiene transparencia: se rellena con blanco en vez de negro.
  if (target === 'jpg') img = img.flatten({ background: '#ffffff' });
  const { imageQuality } = options;
  const formatOptions = LOSSY.has(target) && imageQuality ? { quality: imageQuality } : {};
  await img.toFormat(SHARP_FORMAT[target], formatOptions).toFile(output);
}
