import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const publicPackages = ['types', 'core', 'application', 'sdk'];
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const writeJson = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export function command(executable, args, cwd = root) {
  return execFileSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

export function validateArchiveFiles(files) {
  for (const file of files) {
    assert.ok(
      !file.includes('..') && !file.startsWith('/'),
      `Unsafe archive path: ${file}`,
    );
    assert.match(
      file,
      /^package\/(?:package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.md|licenses\/[^/]+\.txt|dist\/.+\.(?:js|d\.ts))$/,
    );
  }
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.d.ts',
  ])
    assert.ok(files.includes('package/' + required), `Missing ${required}`);
}
export function validateManifest(pkg, versions) {
  assert.ok(!pkg.private, `${pkg.name} is private`);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.publishConfig.access, 'public');
  assert.equal(pkg.exports['.'].import, './dist/index.js');
  assert.equal(pkg.exports['.'].types, './dist/index.d.ts');
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    assert.ok(name in versions, `Unexpected runtime dependency: ${name}`);
    assert.equal(
      version,
      versions[name],
      'Runtime dependencies must resolve to the exact packed version',
    );
  }
  assert.ok(
    !JSON.stringify(pkg).includes('workspace:'),
    'Unresolved workspace protocol',
  );
  assert.ok(
    !JSON.stringify(pkg).includes('catalog:'),
    'Unresolved catalog protocol',
  );
}

// Build into a fresh staging tree so a removed source file cannot leak via stale dist output.
export function preparePackages() {
  const cache = join(root, '.cache/package-release');
  mkdirSync(cache, { recursive: true });
  const output = mkdtempSync(join(cache, 'run-'));
  const staging = join(output, 'staging');
  const artifacts = join(output, 'artifacts');
  mkdirSync(staging);
  mkdirSync(artifacts);
  writeJson(join(staging, 'package.json'), {
    name: 'myanlex-pack-staging',
    private: true,
    packageManager: readJson(join(root, 'package.json')).packageManager,
  });
  cpSync(
    join(root, 'pnpm-workspace.yaml'),
    join(staging, 'pnpm-workspace.yaml'),
  );
  const versions = Object.fromEntries(
    publicPackages.map((name) => {
      const pkg = readJson(join(root, 'packages', name, 'package.json'));
      return [pkg.name, pkg.version];
    }),
  );
  for (const name of publicPackages) {
    const source = join(root, 'packages', name);
    const target = join(staging, 'packages', name);
    mkdirSync(target, { recursive: true });
    const pkg = readJson(join(source, 'package.json'));
    for (const hook of ['prepack', 'postpack', 'prepare'])
      assert.ok(
        !pkg.scripts?.[hook],
        `Review lifecycle hook before packing: ${hook}`,
      );
    cpSync(join(source, 'package.json'), join(target, 'package.json'));
    for (const file of pkg.files.filter((file) => file !== 'dist'))
      cpSync(join(source, file), join(target, file), { recursive: true });
    command(process.execPath, [
      join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(source, 'tsconfig.build.json'),
      '--outDir',
      join(target, 'dist'),
      '--tsBuildInfoFile',
      join(output, name + '.tsbuildinfo'),
      '--sourceMap',
      'false',
      '--declarationMap',
      'false',
    ]);
  }
  const packages = [];
  for (const name of publicPackages) {
    // pnpm pack resolves workspace versions through installed dependency links.
    // These links stay inside staging; consumers receive only the tarballs.
    const target = join(staging, 'packages', name);
    const pkgSource = readJson(join(target, 'package.json'));
    for (const dependency of Object.keys(pkgSource.dependencies ?? {})) {
      assert.ok(dependency in versions, `Unexpected dependency: ${dependency}`);
      mkdirSync(join(target, 'node_modules/@myanlex'), { recursive: true });
      symlinkSync(
        join(staging, 'packages', dependency.slice('@myanlex/'.length)),
        join(target, 'node_modules', dependency),
        'dir',
      );
    }
    command('pnpm', ['pack', '--pack-destination', artifacts], target);
    const filename = `myanlex-${name}-${versions['@myanlex/' + name]}.tgz`;
    const archive = join(artifacts, filename);
    const files = command('tar', ['-tzf', archive]).split('\n');
    validateArchiveFiles(files);
    const pkg = JSON.parse(
      command('tar', ['-xOzf', archive, 'package/package.json']),
    );
    validateManifest(pkg, versions);
    if (name === 'core') {
      for (const file of [
        'THIRD_PARTY_NOTICES.md',
        'licenses/Apache-2.0.txt',
        'licenses/Unicode-3.0.txt',
      ])
        assert.ok(
          files.includes('package/' + file),
          `Missing third-party notice: ${file}`,
        );
    }
    packages.push({
      name: pkg.name,
      version: pkg.version,
      filename,
      sha256: sha256(readFileSync(archive)),
      files,
    });
  }
  assert.equal(readdirSync(artifacts).length, publicPackages.length);
  const manifest = {
    format: 'myanlex-package-set-v1',
    sourceCommit: command('git', ['rev-parse', 'HEAD']),
    dirty: command('git', ['status', '--porcelain']).length > 0,
    releaseApproved: false,
    node: process.version,
    unicode: process.versions.unicode,
    packageManager: command('pnpm', ['--version']),
    packages,
  };
  writeJson(join(artifacts, 'manifest.json'), manifest);
  return { output, artifacts, manifest };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = preparePackages();
  process.stdout.write(
    `Prepared non-published package set: ${result.artifacts}\n`,
  );
}
