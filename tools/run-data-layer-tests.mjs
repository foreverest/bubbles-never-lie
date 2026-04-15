import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const outfile = resolve('dist/test/data-layer.test.mjs');

await mkdir(dirname(outfile), { recursive: true });
await build({
  entryPoints: ['src/server/data/data-layer.test.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  packages: 'external',
  platform: 'node',
});

const child = spawn(process.execPath, ['--test', outfile], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
