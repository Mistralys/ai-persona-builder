import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    'plugins/ledger/index': 'src/plugins/ledger/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'node18',
  // Make the CLI entry executable
  onSuccess: 'node -e "const fs=require(\'fs\');const f=\'dist/cli.js\';if(fs.existsSync(f)){const s=fs.statSync(f);fs.chmodSync(f,s.mode|0o111);}"',
});
