import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const LOCAL_DEPLOY_ASSETS = ['main.js', 'manifest.json', 'styles.css'];

export function loadLocalEnvironment(sourceDirectory = process.cwd()) {
  const envPath = path.join(sourceDirectory, '.env.local');
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
}

export function resolveLocalVaultPath(argument, environment = process.env) {
  const value = argument || environment.WINDY_VAULT;
  return typeof value === 'string' && value.trim() ? path.resolve(value.trim()) : null;
}

export function deployLocalPlugin(vaultPath, sourceDirectory = process.cwd()) {
  if (!vaultPath) {
    throw new Error('Pass the Obsidian vault path or configure WINDY_VAULT.');
  }

  const pluginPath = path.join(vaultPath, '.obsidian', 'plugins', 'windy');
  mkdirSync(pluginPath, { recursive: true });

  for (const filename of LOCAL_DEPLOY_ASSETS) {
    const sourcePath = path.join(sourceDirectory, filename);
    if (!existsSync(sourcePath)) {
      throw new Error(`Missing ${filename}. Run the build first.`);
    }
    copyFileSync(sourcePath, path.join(pluginPath, filename));
  }

  writeFileSync(path.join(pluginPath, '.hotreload'), '');
  return pluginPath;
}

export function createLocalDeployPlugin(vaultPath, sourceDirectory = process.cwd()) {
  return {
    name: 'windy-local-deploy',
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length > 0) {
          return;
        }
        const pluginPath = deployLocalPlugin(vaultPath, sourceDirectory);
        process.stdout.write(`Deployed Windy to ${pluginPath}\n`);
      });
    },
  };
}
