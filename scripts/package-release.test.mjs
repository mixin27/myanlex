import assert from 'node:assert/strict';
import test from 'node:test';
import { validateArchiveFiles, validateManifest } from './package-release.mjs';

const files = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
  'package/dist/index.js',
  'package/dist/index.d.ts',
];
test('package allowlist rejects source, secrets, missing declarations and unsafe paths', () => {
  validateArchiveFiles(files);
  for (const file of [
    'package/.env',
    'package/src/index.ts',
    'package/../outside.js',
    '/package/LICENSE',
    'package/node_modules/a.js',
    'package/dist/index.js.map',
  ])
    assert.throws(() => validateArchiveFiles([...files, file]));
  assert.throws(() => validateArchiveFiles(files.slice(0, -1)));
});
test('packed manifests require resolved dependencies and public ESM declarations', () => {
  const pkg = {
    name: '@myanlex/core',
    type: 'module',
    publishConfig: { access: 'public' },
    exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
    dependencies: { '@myanlex/types': '0.0.0' },
  };
  const versions = { '@myanlex/types': '0.0.0' };
  validateManifest(pkg, versions);
  for (const dependencies of [
    { '@myanlex/types': 'workspace:*' },
    { '@myanlex/types': '0.0.1' },
    { '@nestjs/core': '12.0.3' },
  ])
    assert.throws(() => validateManifest({ ...pkg, dependencies }, versions));
  assert.throws(() => validateManifest({ ...pkg, private: true }, versions));
  assert.throws(() =>
    validateManifest(
      { ...pkg, devDependencies: { typescript: 'catalog:' } },
      versions,
    ),
  );
});
