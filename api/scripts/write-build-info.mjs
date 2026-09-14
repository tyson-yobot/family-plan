// Records the commit and build time into dist/build-info.json so that
// /api/version reports the code that is actually running. Run as part of
// `npm run build`, after tsc has created dist/.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function commitSha() {
  // Railway sets this during the build; it is the authoritative value there.
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const info = { commit: commitSha(), deployed_at: new Date().toISOString() };
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'build-info.json'), JSON.stringify(info, null, 2));
console.log(`build-info.json written: commit ${info.commit} at ${info.deployed_at}`);
