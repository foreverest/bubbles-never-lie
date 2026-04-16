import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const testEntryPoints = [
  'src/server/data/data-layer.test.ts',
  'src/server/core/contributor-chart.test.ts',
  'src/server/routes/chart-response-cache.test.ts',
];
const outdir = resolve('dist/test');

await mkdir(outdir, { recursive: true });
await build({
  entryPoints: testEntryPoints,
  outdir,
  bundle: true,
  format: 'esm',
  outExtension: {
    '.js': '.mjs',
  },
  packages: 'external',
  platform: 'node',
});

const outfiles = testEntryPoints.map((entryPoint) =>
  resolve(outdir, entryPoint.replace(/^src\/server\//, '').replace(/\.ts$/, '.mjs'))
);

const child = spawn(process.execPath, ['--test', ...outfiles], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
