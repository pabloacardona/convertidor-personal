import { tools } from '../tools.js';
import { run } from '../run.js';

// Códecs de audio; los que no tienen bitrate son sin pérdida.
const AUDIO_CODECS = {
  mp3: { lib: 'libmp3lame', bitrate: '192k' },
  pcm: { lib: 'pcm_s16le' },
  vorbis: { lib: 'libvorbis', bitrate: '192k' },
  flac: { lib: 'flac' },
  aac: { lib: 'aac', bitrate: '192k' },
  opus: { lib: 'libopus', bitrate: '128k' },
};

const AUDIO_TARGETS = { mp3: 'mp3', wav: 'pcm', ogg: 'vorbis', flac: 'flac', aac: 'aac', m4a: 'aac', opus: 'opus' };

const VIDEO_TARGETS = {
  mp4: { video: 'x264', audio: 'aac', extra: ['-movflags', '+faststart'] },
  mov: { video: 'x264', audio: 'aac' },
  mkv: { video: 'x264', audio: 'aac' },
  webm: { video: 'vp9', audio: 'opus' },
  avi: { video: 'mpeg4', audio: 'mp3' },
};

// Valor de calidad por códec: CRF para x264/VP9, q:v para MPEG-4 (menor = mejor).
const VIDEO_QUALITY = {
  x264: { high: 19, medium: 23, low: 28 },
  vp9: { high: 28, medium: 33, low: 40 },
  mpeg4: { high: 2, medium: 4, low: 7 },
};

const DEFAULT_GIF_HEIGHT = 360;

// Reduce a la altura pedida sin agrandar nunca y manteniendo dimensiones pares.
const scaleFilter = (height) => `scale=-2:trunc(min(${height}\\,ih)/2)*2`;

function videoArgs(codec, quality = 'medium') {
  const q = String(VIDEO_QUALITY[codec][quality]);
  switch (codec) {
    case 'x264':
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', q, '-pix_fmt', 'yuv420p'];
    case 'vp9':
      return ['-c:v', 'libvpx-vp9', '-crf', q, '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4'];
    default:
      return ['-c:v', 'mpeg4', '-q:v', q];
  }
}

function audioArgs(codecKey, { audioBitrate, mono }) {
  const codec = AUDIO_CODECS[codecKey];
  const args = ['-c:a', codec.lib];
  if (codec.bitrate) args.push('-b:a', audioBitrate ? `${audioBitrate}k` : codec.bitrate);
  if (mono) args.push('-ac', '1');
  return args;
}

function encodeArgs(target, opts) {
  if (target === 'gif') {
    const height = opts.height ?? DEFAULT_GIF_HEIGHT;
    const filter = `fps=12,${scaleFilter(height)}:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`;
    return ['-vf', filter, '-loop', '0', '-an'];
  }
  if (AUDIO_TARGETS[target]) return ['-vn', ...audioArgs(AUDIO_TARGETS[target], opts)];

  const spec = VIDEO_TARGETS[target];
  const args = videoArgs(spec.video, opts.quality);
  if (opts.height) args.push('-vf', scaleFilter(opts.height));
  args.push(...(opts.noAudio ? ['-an'] : audioArgs(spec.audio, opts)));
  return [...args, ...(spec.extra ?? [])];
}

const toSeconds = (h, m, s) => Number(h) * 3600 + Number(m) * 60 + Number(s);

export async function convertMedia({ input, output, target, options = {}, signal, onProgress }) {
  if (!tools.ffmpeg) throw new Error('FFmpeg no está disponible');
  const { start = 0, end } = options;

  const args = ['-y', '-hide_banner', '-nostdin', '-nostats', '-loglevel', 'info', '-progress', 'pipe:1'];
  if (start) args.push('-ss', String(start));
  args.push('-i', input);
  if (end) args.push('-t', String(end - start));
  args.push(...encodeArgs(target, options), output);

  // FFmpeg informa la duración en stderr y el tiempo procesado en stdout (-progress).
  let total = null;
  let stderrHead = '';
  let stdoutRest = '';
  await run(tools.ffmpeg, args, {
    signal,
    onStderr: (text) => {
      if (total !== null || stderrHead.length > 20000) return;
      stderrHead += text;
      const m = stderrHead.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) total = Math.max(0.1, Math.min(toSeconds(m[1], m[2], m[3]) - start, end ? end - start : Infinity));
    },
    onStdout: (text) => {
      const lines = (stdoutRest + text).split('\n');
      stdoutRest = lines.pop();
      for (const line of lines) {
        const [key, value] = line.trim().split('=');
        if (key === 'out_time_us' && total && Number(value) > 0) {
          onProgress?.(Math.min(0.99, Number(value) / 1e6 / total));
        }
      }
    },
  });
}
