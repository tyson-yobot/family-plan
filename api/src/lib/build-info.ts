import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuildInfo {
  commit: string;
  deployed_at: string;
}

/**
 * Written by scripts/write-build-info.mjs at build time, so /api/version reports
 * the commit that is actually running rather than whatever was deployed last.
 * A health check can return 200 while running stale code, which is why this
 * exists at all.
 */
function read(): BuildInfo {
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const raw = readFileSync(join(here, '..', 'build-info.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<BuildInfo>;
    if (parsed.commit && parsed.deployed_at) {
      return { commit: parsed.commit, deployed_at: parsed.deployed_at };
    }
  } catch {
    // Falls through to the env-var reading below.
  }
  // Running from source (npm run dev) rather than a build, so there is no
  // build-info file. Report what the environment knows and say plainly when it
  // knows nothing, rather than inventing a commit.
  return {
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'unknown (not built)',
    deployed_at: 'unknown (not built)',
  };
}

export const buildInfo: BuildInfo = read();
