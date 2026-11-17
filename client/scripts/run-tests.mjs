import esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../.test-dist');
const outfile = path.join(distDir, 'bundle.mjs');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

try {
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../tests/index.test.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile,
    sourcemap: 'inline',
  });

  const child = spawn(process.execPath, ['--test', outfile], {
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} catch (err) {
  console.error('Test build failed:', err);
  process.exit(1);
}
