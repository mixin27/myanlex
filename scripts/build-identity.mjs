import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';

let identity = process.env.MYANLEX_BUILD_ID;
if (!identity) {
  try {
    identity = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    if (
      execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim()
    )
      identity += '-dirty';
  } catch {
    identity = 'development';
  }
}
if (!/^[a-zA-Z0-9._-]{1,120}$/.test(identity))
  throw new Error('Invalid MYANLEX_BUILD_ID.');
writeFileSync(
  new URL(
    '../packages/playground/src/build-identity.generated.ts',
    import.meta.url,
  ),
  `// Generated build provenance; do not edit.\nexport const engineBuild = ${JSON.stringify(identity)};\n`,
);
