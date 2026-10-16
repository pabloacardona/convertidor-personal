import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const OUTPUTS_DIR = path.join(DATA_DIR, 'outputs');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
