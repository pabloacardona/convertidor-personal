import { AUDIO_BITRATES, HEIGHTS, QUALITIES } from './presets.js';

// Acepta segundos ("90", "12.5") o reloj ("1:30", "01:02:03.5").
export function parseTime(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const m = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) throw new Error(`Tiempo inválido: "${text}" (usa segundos o mm:ss)`);
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Deja pasar solo opciones conocidas y con valores válidos para el motor.
export function sanitizeOptions(raw, category) {
  const opts = {};
  if (!raw || typeof raw !== 'object') return opts;

  if (category.engine === 'sharp') {
    const q = Number(raw.imageQuality);
    if (q >= 1 && q <= 100) opts.imageQuality = Math.round(q);
    return opts;
  }
  if (category.engine !== 'ffmpeg') return opts;

  if (QUALITIES.includes(raw.quality)) opts.quality = raw.quality;
  if (HEIGHTS.includes(Number(raw.height))) opts.height = Number(raw.height);
  if (AUDIO_BITRATES.includes(String(raw.audioBitrate))) opts.audioBitrate = String(raw.audioBitrate);
  if (raw.mono === true) opts.mono = true;
  if (raw.noAudio === true) opts.noAudio = true;

  const start = parseTime(raw.start);
  const end = parseTime(raw.end);
  if (start) opts.start = start;
  if (end !== undefined) {
    if (end <= (start ?? 0)) throw new Error('El fin del recorte debe ser mayor que el inicio');
    opts.end = end;
  }
  return opts;
}
