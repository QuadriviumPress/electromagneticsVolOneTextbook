// convert-figures.js — EPS → SVG for every figure in the source distro.
//
// Runs as `prebuild`. Output lands in generated/figures/ (git-ignored) and is
// passthrough-copied to /figures/ by eleventy.config.js. The EPS sources are
// never modified.
//
// Requires dvisvgm (with ghostscript) on PATH. When absent locally the script
// warns and exits 0 so contributors without TeX tooling can still build the
// HTML; in CI (CI=true) it is a hard failure.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modulesDir, generatedFiguresDir } from '../lib/paths.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = modulesDir(root);
const outDir = generatedFiguresDir(root);

const probe = spawnSync('dvisvgm', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  const msg = '[figures] dvisvgm not found — skipping EPS→SVG conversion';
  if (process.env.CI) {
    console.error(`${msg} (fatal in CI; install ghostscript + dvisvgm)`);
    process.exit(1);
  }
  console.warn(`${msg} (figure images will be missing from the local build)`);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });

const epsFiles = fs
  .readdirSync(srcDir)
  .filter(f => f.endsWith('.eps'))
  .sort();

let converted = 0;
let skipped = 0;
const failures = [];

const DVISVGM_OPTS = ['--no-fonts', '--optimize', '--precision=2'];

for (const eps of epsFiles) {
  const src = path.join(srcDir, eps);
  const out = path.join(outDir, eps.replace(/\.eps$/, '.svg'));
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
    skipped++;
    continue;
  }
  let res = spawnSync('dvisvgm', ['--eps', ...DVISVGM_OPTS, '-o', out, src], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    // Some EPS files embed JPEG data via a Ghostscript-device idiom that
    // dvisvgm's EPS reader rejects ("imgdev jpeg finddevice"). Re-distilling
    // through gs pdfwrite normalizes them, and dvisvgm converts the PDF fine.
    const tmpPdf = `${out}.tmp.pdf`;
    const gs = spawnSync(
      'gs',
      ['-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', '-dEPSCrop', '-o', tmpPdf, src],
      { encoding: 'utf8' }
    );
    if (gs.status === 0) {
      res = spawnSync('dvisvgm', ['--pdf', ...DVISVGM_OPTS, '-o', out, tmpPdf], {
        encoding: 'utf8',
      });
    }
    fs.rmSync(tmpPdf, { force: true });
    if (gs.status !== 0 || res.status !== 0) {
      const stderr = ((gs.status !== 0 ? gs.stderr : res.stderr) || '').trim().slice(0, 500);
      failures.push({ eps, stderr });
      continue;
    }
  }
  converted++;
}

console.log(
  `[figures] ${converted} converted, ${skipped} up to date, ${failures.length} failed (${epsFiles.length} EPS total)`
);
for (const f of failures) {
  console.error(`[figures] FAILED ${f.eps}\n${f.stderr}`);
}
if (failures.length > 0) process.exit(1);
