// Valores permitidos y presets para audio y video.
export const QUALITIES = ['high', 'medium', 'low'];
export const HEIGHTS = [2160, 1440, 1080, 720, 480, 360];
export const AUDIO_BITRATES = ['320', '256', '192', '160', '128', '96', '64'];

export const MEDIA_PRESETS = [
  { id: 'default', label: 'Predeterminado', options: {} },
  { id: 'high', label: 'Alta calidad', options: { quality: 'high', audioBitrate: '320' } },
  { id: 'fullhd', label: 'Full HD equilibrado (1080p)', options: { quality: 'medium', height: 1080, audioBitrate: '192' } },
  { id: 'share', label: 'Ligero para compartir (720p)', options: { quality: 'low', height: 720, audioBitrate: '128' } },
  { id: 'tiny', label: 'Mínimo tamaño (480p)', options: { quality: 'low', height: 480, audioBitrate: '96', mono: true } },
  { id: 'voice', label: 'Voz / podcast (mono 64 kbps)', options: { audioBitrate: '64', mono: true } },
];
