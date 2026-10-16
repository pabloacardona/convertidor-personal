// Detecta qué motores de conversión hay disponibles en esta máquina.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

function which(cmd) {
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(finder, [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

const LIBREOFFICE_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
];

const PANDOC_PATHS = [
  `${process.env.LOCALAPPDATA}\\Pandoc\\pandoc.exe`,
  'C:\\Program Files\\Pandoc\\pandoc.exe',
];

export const tools = {
  sharp: 'sharp',
  ffmpeg: ffmpegStatic && existsSync(ffmpegStatic) ? ffmpegStatic : which('ffmpeg'),
  libreoffice: which('soffice') ?? LIBREOFFICE_PATHS.find((p) => existsSync(p)) ?? null,
  pandoc: which('pandoc') ?? PANDOC_PATHS.find((p) => existsSync(p)) ?? null,
};
