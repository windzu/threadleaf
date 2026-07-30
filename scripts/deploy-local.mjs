import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const vaultPath = process.argv[2] || process.env.WINDY_VAULT;
if (!vaultPath) {
  throw new Error('Pass the Obsidian vault path as the first argument.');
}

const pluginPath = path.join(vaultPath, '.obsidian', 'plugins', 'windy');
mkdirSync(pluginPath, { recursive: true });

for (const filename of ['main.js', 'manifest.json', 'styles.css']) {
  if (!existsSync(filename)) {
    throw new Error(`Missing ${filename}. Run the build first.`);
  }
  copyFileSync(filename, path.join(pluginPath, filename));
}

writeFileSync(path.join(pluginPath, '.hotreload'), '');

process.stdout.write(`Deployed Windy to ${pluginPath}\n`);
