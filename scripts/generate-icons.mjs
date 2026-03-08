/**
 * Icon & Asset Generation Script
 * Generates all PWA icons, favicons, Apple touch icons, OG images, and social cards
 * from SVG master sources using sharp.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const ICONS_DIR = join(PUBLIC, 'icons');
const FAVICONS_DIR = join(PUBLIC, 'favicons');
const OG_DIR = join(PUBLIC, 'og');

// Ensure directories exist
[ICONS_DIR, FAVICONS_DIR, OG_DIR].forEach(d => mkdirSync(d, { recursive: true }));

// Read SVG sources
const masterSvg = readFileSync(join(ICONS_DIR, 'icon-master.svg'));
const smallSvg = readFileSync(join(ICONS_DIR, 'icon-small.svg'));
const maskableSvg = readFileSync(join(ICONS_DIR, 'icon-maskable.svg'));
const monoSvg = readFileSync(join(ICONS_DIR, 'icon-monochrome.svg'));

// ─── Standard PWA Icons ───────────────────────────────────────
const standardSizes = [72, 96, 128, 144, 152, 192, 256, 384, 512, 1024];

async function generateStandardIcons() {
  console.log('Generating standard PWA icons...');
  for (const size of standardSizes) {
    // Use simplified SVG for sizes <= 64px for better legibility
    const svg = size <= 64 ? smallSvg : masterSvg;
    await sharp(svg, { density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(join(ICONS_DIR, `icon-${size}.png`));
    console.log(`  icon-${size}.png`);
  }
}

// ─── Maskable Icons ───────────────────────────────────────────
async function generateMaskableIcons() {
  console.log('Generating maskable icons...');
  for (const size of [192, 512]) {
    await sharp(maskableSvg, { density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(join(ICONS_DIR, `icon-maskable-${size}.png`));
    console.log(`  icon-maskable-${size}.png`);
  }
}

// ─── Apple Touch Icons ────────────────────────────────────────
async function generateAppleIcons() {
  console.log('Generating Apple touch icons...');
  const appleSizes = [
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 152, name: 'apple-touch-icon-152.png' },
    { size: 167, name: 'apple-touch-icon-167.png' },
    { size: 180, name: 'apple-touch-icon-180.png' },
  ];
  for (const { size, name } of appleSizes) {
    await sharp(masterSvg, { density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(join(ICONS_DIR, name));
    console.log(`  ${name}`);
  }
}

// ─── Favicons ─────────────────────────────────────────────────
async function generateFavicons() {
  console.log('Generating favicons...');
  const faviconSizes = [16, 32, 48];
  for (const size of faviconSizes) {
    // Always use simplified SVG for favicons — they're always small
    await sharp(smallSvg, { density: 300 })
      .resize(size, size, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(join(FAVICONS_DIR, `favicon-${size}x${size}.png`));
    console.log(`  favicon-${size}x${size}.png`);
  }

  // Also generate the PNG favicons at root level for broader compat
  await sharp(smallSvg, { density: 300 })
    .resize(32, 32, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
    .png()
    .toFile(join(PUBLIC, 'favicon.png'));

  // Generate ICO-compatible 32x32 PNG (browsers accept PNG as favicon)
  await sharp(smallSvg, { density: 300 })
    .resize(32, 32, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
    .png()
    .toFile(join(PUBLIC, 'favicon.ico'));

  console.log('  favicon.png, favicon.ico');
}

// ─── Monochrome mask icon ─────────────────────────────────────
async function generateMonochrome() {
  console.log('Generating monochrome mask icon...');
  // Safari pinned tab wants SVG — we already have it
  // Also generate a PNG version for reference
  await sharp(monoSvg, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(join(ICONS_DIR, 'icon-monochrome-512.png'));
  console.log('  icon-monochrome-512.png');
}

// ─── OG Image ─────────────────────────────────────────────────
function createOgSvg(width, height) {
  // Grid line generation
  let gridLines = '';
  const gridSpacing = 40;
  for (let x = 0; x < width; x += gridSpacing) {
    gridLines += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#0E2A40" stroke-width="1" opacity="0.4"/>`;
  }
  for (let y = 0; y < height; y += gridSpacing) {
    gridLines += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#0E2A40" stroke-width="1" opacity="0.4"/>`;
  }

  // Circuit trace decorations
  const circuitTraces = `
    <line x1="0" y1="${height * 0.3}" x2="${width * 0.15}" y2="${height * 0.3}" stroke="#0088A3" stroke-width="2" opacity="0.3"/>
    <line x1="${width * 0.15}" y1="${height * 0.3}" x2="${width * 0.15}" y2="${height * 0.55}" stroke="#0088A3" stroke-width="2" opacity="0.3"/>
    <line x1="${width * 0.85}" y1="${height * 0.7}" x2="${width}" y2="${height * 0.7}" stroke="#0088A3" stroke-width="2" opacity="0.3"/>
    <line x1="${width * 0.85}" y1="${height * 0.45}" x2="${width * 0.85}" y2="${height * 0.7}" stroke="#0088A3" stroke-width="2" opacity="0.3"/>
    <circle cx="${width * 0.15}" cy="${height * 0.3}" r="4" fill="#00BCD4" opacity="0.4"/>
    <circle cx="${width * 0.85}" cy="${height * 0.7}" r="4" fill="#00BCD4" opacity="0.4"/>
  `;

  // Icon section (left side) — simplified network symbol
  const iconCx = width * 0.2;
  const iconCy = height * 0.48;
  const iconScale = Math.min(width, height) * 0.0022;
  const s = iconScale;

  const iconSymbol = `
    <g transform="translate(${iconCx}, ${iconCy}) scale(${s})">
      <!-- Container frame -->
      <rect x="-140" y="-140" width="280" height="280" rx="28" fill="none" stroke="#1B3A5C" stroke-width="12"/>
      <rect x="-116" y="-116" width="232" height="232" rx="16" fill="none" stroke="#1E4D6E" stroke-width="5"/>

      <!-- Network lines -->
      <line x1="-70" y1="-40" x2="70" y2="-40" stroke="#00BCD4" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="-70" y1="0" x2="70" y2="0" stroke="#00BCD4" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="-70" y1="40" x2="70" y2="40" stroke="#00BCD4" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="0" y1="-80" x2="0" y2="80" stroke="#00BCD4" stroke-width="3.5" stroke-linecap="round"/>

      <!-- Branch lines -->
      <line x1="-40" y1="-40" x2="-40" y2="40" stroke="#00BCD4" stroke-width="2" stroke-linecap="round"/>
      <line x1="40" y1="-40" x2="40" y2="40" stroke="#00BCD4" stroke-width="2" stroke-linecap="round"/>

      <!-- Top/bottom nodes -->
      <circle cx="0" cy="-72" r="14" fill="#0A1628" stroke="#00E5FF" stroke-width="4"/>
      <circle cx="0" cy="-72" r="6" fill="#00E5FF"/>
      <circle cx="0" cy="72" r="14" fill="#0A1628" stroke="#00E5FF" stroke-width="4"/>
      <circle cx="0" cy="72" r="6" fill="#00E5FF"/>

      <!-- Side nodes -->
      <circle cx="-70" cy="-40" r="11" fill="#0A1628" stroke="#00BCD4" stroke-width="3.5"/>
      <circle cx="-70" cy="-40" r="4.5" fill="#00BCD4"/>
      <circle cx="70" cy="-40" r="11" fill="#0A1628" stroke="#00BCD4" stroke-width="3.5"/>
      <circle cx="70" cy="-40" r="4.5" fill="#00BCD4"/>
      <circle cx="-70" cy="40" r="11" fill="#0A1628" stroke="#00BCD4" stroke-width="3.5"/>
      <circle cx="-70" cy="40" r="4.5" fill="#00BCD4"/>
      <circle cx="70" cy="40" r="11" fill="#0A1628" stroke="#00BCD4" stroke-width="3.5"/>
      <circle cx="70" cy="40" r="4.5" fill="#00BCD4"/>

      <!-- Central hub -->
      <circle cx="0" cy="0" r="20" fill="#0A1628" stroke="#00E5FF" stroke-width="5"/>
      <circle cx="0" cy="0" r="9" fill="#00E5FF"/>

      <!-- Small junction nodes -->
      <circle cx="-40" cy="-40" r="7" fill="#0A1628" stroke="#0088A3" stroke-width="2.5"/>
      <circle cx="40" cy="-40" r="7" fill="#0A1628" stroke="#0088A3" stroke-width="2.5"/>
      <circle cx="-40" cy="40" r="7" fill="#0A1628" stroke="#0088A3" stroke-width="2.5"/>
      <circle cx="40" cy="40" r="7" fill="#0A1628" stroke="#0088A3" stroke-width="2.5"/>
      <circle cx="-40" cy="0" r="7" fill="#0A1628" stroke="#0088A3" stroke-width="2.5"/>
      <circle cx="40" cy="0" r="7" fill="#0A1628" stroke="#0088A3" stroke-width="2.5"/>

      <!-- Vault seal -->
      <rect x="-56" y="-134" width="112" height="6" rx="3" fill="#00E5FF" opacity="0.7"/>
    </g>
  `;

  // Text section (right side)
  const textX = width * 0.42;
  const textSection = `
    <text x="${textX}" y="${height * 0.38}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="42" font-weight="700" fill="#FFFFFF" letter-spacing="0.5">Portable BAS Project Toolkit</text>
    <text x="${textX}" y="${height * 0.52}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="22" font-weight="400" fill="#8899AA" letter-spacing="0.3">Field-Ready Project Container for</text>
    <text x="${textX}" y="${height * 0.60}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="22" font-weight="400" fill="#8899AA" letter-spacing="0.3">Building Automation Systems</text>
    <line x1="${textX}" y1="${height * 0.67}" x2="${textX + 280}" y2="${height * 0.67}" stroke="#00BCD4" stroke-width="2" opacity="0.5"/>
    <text x="${textX}" y="${height * 0.76}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="16" font-weight="500" fill="#00BCD4" letter-spacing="1.5" opacity="0.8">BAS FIELD VAULT</text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#070E1A"/>
      <stop offset="50%" stop-color="#0A1628"/>
      <stop offset="100%" stop-color="#0D1B2E"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#ogBg)"/>
  ${gridLines}
  ${circuitTraces}
  ${iconSymbol}
  ${textSection}
  <!-- Top accent line -->
  <rect x="0" y="0" width="${width}" height="4" fill="#00BCD4" opacity="0.6"/>
  <!-- Bottom accent line -->
  <rect x="0" y="${height - 4}" width="${width}" height="4" fill="#00BCD4" opacity="0.3"/>
</svg>`;
}

async function generateOgImages() {
  console.log('Generating Open Graph images...');

  // OG image 1200x630
  const ogSvg = createOgSvg(1200, 630);
  await sharp(Buffer.from(ogSvg))
    .png({ quality: 95 })
    .toFile(join(OG_DIR, 'og-image.png'));
  console.log('  og-image.png (1200x630)');

  // Twitter card 1200x600
  const twitterSvg = createOgSvg(1200, 600);
  await sharp(Buffer.from(twitterSvg))
    .png({ quality: 95 })
    .toFile(join(OG_DIR, 'twitter-card.png'));
  console.log('  twitter-card.png (1200x600)');

  // Large preview 1600x900
  const largeSvg = createOgSvg(1600, 900);
  await sharp(Buffer.from(largeSvg))
    .png({ quality: 95 })
    .toFile(join(OG_DIR, 'preview-large.png'));
  console.log('  preview-large.png (1600x900)');
}

// ─── Run All ──────────────────────────────────────────────────
async function main() {
  console.log('🔧 BAS Toolkit Icon & Asset Generator\n');

  await generateStandardIcons();
  await generateMaskableIcons();
  await generateAppleIcons();
  await generateFavicons();
  await generateMonochrome();
  await generateOgImages();

  // Copy key assets to public root for direct access
  await sharp(masterSvg, { density: 300 })
    .resize(192, 192, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
    .png()
    .toFile(join(PUBLIC, 'icon-192.png'));

  await sharp(masterSvg, { density: 300 })
    .resize(512, 512, { fit: 'contain', background: { r: 10, g: 22, b: 40, alpha: 1 } })
    .png()
    .toFile(join(PUBLIC, 'icon-512.png'));

  console.log('\n✅ All assets generated successfully!');
  console.log(`\nOutput directories:`);
  console.log(`  ${ICONS_DIR}`);
  console.log(`  ${FAVICONS_DIR}`);
  console.log(`  ${OG_DIR}`);
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
