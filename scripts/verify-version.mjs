import { readFile } from 'node:fs/promises';

const [packageDocument, manifestDocument, versionsDocument] = await Promise.all(
  [
    readJson('package.json'),
    readJson('manifest.json'),
    readJson('versions.json'),
  ],
);

const packageVersion = packageDocument.version;
const manifestVersion = manifestDocument.version;
const minimumAppVersion = manifestDocument.minAppVersion;
const releaseVersion = process.argv[2];

if (!isSemanticVersion(packageVersion)) {
  throw new Error('package.json version must use x.y.z');
}
if (manifestVersion !== packageVersion) {
  throw new Error('manifest.json version does not match package.json');
}
if (versionsDocument[manifestVersion] !== minimumAppVersion) {
  throw new Error(
    'versions.json must map the current plugin version to minAppVersion',
  );
}
if (releaseVersion !== undefined) {
  if (!isSemanticVersion(releaseVersion)) {
    throw new Error('Release tag must use x.y.z');
  }
  if (releaseVersion !== manifestVersion) {
    throw new Error('Release tag does not match manifest.json');
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function isSemanticVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}
