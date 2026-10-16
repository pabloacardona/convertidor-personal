// Matriz de conversiones: qué entra, qué sale y qué motor lo hace.
export const CATEGORIES = [
  {
    id: 'image',
    label: 'Imagen',
    engine: 'sharp',
    inputs: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'svg'],
    outputs: ['jpg', 'png', 'webp', 'avif', 'gif', 'tiff'],
  },
  {
    id: 'audio',
    label: 'Audio',
    engine: 'ffmpeg',
    inputs: ['mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'opus', 'wma', 'aiff'],
    outputs: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus'],
  },
  {
    id: 'video',
    label: 'Video',
    engine: 'ffmpeg',
    inputs: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'm4v', 'mpeg', 'mpg', '3gp', 'ts'],
    outputs: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'gif', 'mp3', 'wav', 'm4a'],
  },
  {
    id: 'document',
    label: 'Documento',
    engine: 'libreoffice',
    inputs: ['doc', 'docx', 'odt', 'rtf', 'txt', 'wpd'],
    outputs: ['pdf', 'docx', 'odt', 'rtf', 'txt', 'html'],
  },
  {
    id: 'spreadsheet',
    label: 'Hoja de cálculo',
    engine: 'libreoffice',
    inputs: ['xls', 'xlsx', 'ods', 'csv'],
    outputs: ['pdf', 'xlsx', 'ods', 'csv', 'html'],
  },
  {
    id: 'presentation',
    label: 'Presentación',
    engine: 'libreoffice',
    inputs: ['ppt', 'pptx', 'odp'],
    outputs: ['pdf', 'pptx', 'odp'],
  },
  {
    id: 'markup',
    label: 'Texto marcado / ebook',
    engine: 'pandoc',
    inputs: ['md', 'markdown', 'html', 'htm', 'epub', 'rst', 'tex'],
    outputs: ['html', 'md', 'docx', 'odt', 'epub', 'rst'],
  },
];

const ALIASES = { jpeg: 'jpg', tif: 'tiff', htm: 'html', markdown: 'md', oga: 'ogg' };

export const normalizeExt = (ext) => ALIASES[ext] ?? ext;

export function findCategory(ext) {
  return CATEGORIES.find((c) => c.inputs.includes(ext)) ?? null;
}

// Salidas posibles para una extensión (sin convertir un formato a sí mismo).
export function outputsFor(ext) {
  const category = findCategory(ext);
  if (!category) return [];
  return category.outputs.filter((o) => o !== normalizeExt(ext));
}
