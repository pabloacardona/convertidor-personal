import { tools } from '../tools.js';
import { run } from '../run.js';

const AUDIO_CODECS = {
  mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-c:a', 'pcm_s16le'],
  ogg: ['-c:a', 'libvorbis', '-q:a', '5'],
  flac: ['-c:a', 'flac'],
  aac: ['-c:a', 'aac', '-b:a', '192k'],
  m4a: ['-c:a', 'aac', '-b:a', '192k'],
  opus: ['-c:a', 'libopus', '-b:a', '128k'],
};

const H264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'];

const VIDEO_CODECS = {
  mp4: [...H264, '-movflags', '+faststart'],
  mov: H264,
  mkv: H264,
  webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k'],
  avi: ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-q:a', '3'],
};

const GIF_FILTER = 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse';

export async function convertMedia(input, output, target) {
  if (!tools.ffmpeg) throw new Error('FFmpeg no está disponible');
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', input];
  if (target === 'gif') {
    args.push('-vf', GIF_FILTER, '-loop', '0', '-an');
  } else if (AUDIO_CODECS[target]) {
    args.push('-vn', ...AUDIO_CODECS[target]);
  } else {
    args.push(...VIDEO_CODECS[target]);
  }
  args.push(output);
  await run(tools.ffmpeg, args);
}
