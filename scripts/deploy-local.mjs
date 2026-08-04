import process from 'node:process';

import {
  deployLocalPlugin,
  loadLocalEnvironment,
  resolveLocalVaultPath,
} from './local-deployment.mjs';

loadLocalEnvironment();
const vaultPath = resolveLocalVaultPath(process.argv[2]);
if (!vaultPath) {
  throw new Error(
    'Pass the Obsidian vault path or set WINDY_VAULT in .env.local.',
  );
}

const pluginPath = deployLocalPlugin(vaultPath);
process.stdout.write(`Deployed Windy to ${pluginPath}\n`);
