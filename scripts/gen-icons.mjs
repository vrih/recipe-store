/**
 * Generates the committed PWA icons in static/icons/ from the app's SVG logo.
 * Run manually after changing the logo: `node scripts/gen-icons.mjs`.
 * Not part of the build — the PNG outputs are committed to the repo.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src/lib/assets/favicon.svg');
const OUT = join(root, 'static/icons');
const BG = '#fafaf9'; // matches the app background / manifest background_color

const svg = await readFile(SRC);
await mkdir(OUT, { recursive: true });

/** A full-bleed icon on a solid background (purpose: any). */
async function any(size) {
	const logo = await sharp(svg)
		.resize(Math.round(size * 0.82), Math.round(size * 0.82), { fit: 'contain', background: BG })
		.png()
		.toBuffer();
	return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
		.composite([{ input: logo, gravity: 'centre' }])
		.png()
		.toFile(join(OUT, `icon-${size}.png`));
}

/** A maskable icon: logo at ~60% inside the safe zone (purpose: maskable). */
async function maskable(size) {
	const logo = await sharp(svg)
		.resize(Math.round(size * 0.6), Math.round(size * 0.6), { fit: 'contain', background: BG })
		.png()
		.toBuffer();
	return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
		.composite([{ input: logo, gravity: 'centre' }])
		.png()
		.toFile(join(OUT, `maskable-${size}.png`));
}

await Promise.all([any(192), any(512), maskable(192), maskable(512)]);
console.log('Wrote PWA icons to', OUT);
