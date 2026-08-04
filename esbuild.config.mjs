import esbuild from 'esbuild';
import { watch } from 'node:fs';
import { builtinModules } from 'node:module';
import {
  createLocalDeployPlugin,
  deployLocalPlugin,
  loadLocalEnvironment,
  resolveLocalVaultPath,
} from './scripts/local-deployment.mjs';

const production = process.argv[2] === 'production';
if (!production) {
  loadLocalEnvironment();
}
const localVaultPath = production
  ? null
  : resolveLocalVaultPath(process.argv[2]);
let deployTimer;

const deployAssets = () => {
  if (!localVaultPath) return;
  clearTimeout(deployTimer);
  deployTimer = setTimeout(() => {
    const pluginPath = deployLocalPlugin(localVaultPath);
    process.stdout.write(`Deployed Windy assets to ${pluginPath}\n`);
  }, 50);
};

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/state',
    '@codemirror/view',
    ...builtinModules,
    ...builtinModules.map(moduleName => `node:${moduleName}`),
  ],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  minify: production,
  plugins: localVaultPath ? [createLocalDeployPlugin(localVaultPath)] : [],
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  if (!localVaultPath) {
    process.stdout.write(
      'Local deployment disabled. Set WINDY_VAULT in .env.local to enable it.\n',
    );
  } else {
    for (const filename of ['manifest.json', 'styles.css']) {
      watch(filename, deployAssets);
    }
  }
  await context.watch();
}
