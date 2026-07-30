import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

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

const obsidianIconPath = '/Applications/Obsidian.app/Contents/Resources/icon.icns';
if (process.platform === 'darwin' && existsSync(obsidianIconPath)) {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'windy-deploy-'));
  const pngPath = path.join(temporaryDirectory, 'obsidian-icon.png');
  try {
    const conversion = spawnSync(
      'sips',
      ['-z', '96', '96', '-s', 'format', 'png', obsidianIconPath, '--out', pngPath],
      { encoding: 'utf8' },
    );
    if (conversion.status === 0 && existsSync(pngPath)) {
      const iconData = readFileSync(pngPath).toString('base64');
      appendFileSync(
        path.join(pluginPath, 'styles.css'),
        `

/* Personal local build only: Obsidian app icon is not distributed by Windy. */
.windy-floating-button {
  background-color: transparent;
  background-image: url("data:image/png;base64,${iconData}");
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  border: 0;
  box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
}

.windy-floating-button svg {
  display: none;
}
`,
      );
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

process.stdout.write(`Deployed Windy to ${pluginPath}\n`);
