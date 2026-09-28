import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const dir = 'tests/fixtures';
mkdirSync(dir, { recursive: true });

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const still = (file, source, size, quality = 4) =>
  ffmpeg('-f', 'lavfi', '-i', `${source}=size=${size}:rate=1`, '-frames:v', '1', '-q:v', String(quality), `${dir}/${file}`);

/** Inserts an EXIF APP1 segment carrying only the Orientation tag right after SOI. */
function withOrientation(jpeg, orientation) {
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian TIFF header, IFD0 at offset 8
    0x01, 0x00, // one entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // 0x0112 SHORT x1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const length = exif.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), exif]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

still('photo-1.jpg', 'testsrc2', '1200x800');
still('photo-2.jpg', 'smptehdbars', '1200x800');
still('photo-3.jpg', 'mandelbrot', '600x900');
still('photo-4.jpg', 'rgbtestsrc', '1000x1000');
still('photo-5.jpg', 'testsrc', '1600x900');
still('photo-large.jpg', 'testsrc2', '4000x3000', 12);
still('base-rotated.jpg', 'testsrc2', '1200x800');
writeFileSync(`${dir}/photo-rotated.jpg`, withOrientation(readFileSync(`${dir}/base-rotated.jpg`), 6));
unlinkSync(`${dir}/base-rotated.jpg`);
writeFileSync(`${dir}/not-an-image.jpg`, 'this is not a jpeg');
ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:duration=5:sample_rate=22050', '-ac', '1', '-c:a', 'pcm_s16le', `${dir}/tone-5s.wav`);
console.log('fixtures written to', dir);
