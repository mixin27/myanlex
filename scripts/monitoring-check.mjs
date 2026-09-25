import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const directory = fileURLToPath(new URL('../monitoring', import.meta.url));
const run = (image, entrypoint, args) =>
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--network=none',
      '-v',
      `${directory}:/etc/prometheus:ro`,
      '-w',
      '/etc/prometheus',
      '--entrypoint',
      entrypoint,
      image,
      ...args,
    ],
    { stdio: 'inherit', timeout: 120_000 },
  );

run('prom/prometheus:v3.15.0', '/bin/promtool', [
  'check',
  'config',
  '--syntax-only',
  'prometheus.yml',
]);
run('prom/prometheus:v3.15.0', '/bin/promtool', [
  'test',
  'rules',
  'alerts.test.yml',
]);
run('prom/alertmanager:v0.34.1', '/bin/amtool', [
  'check-config',
  'alertmanager.yml',
]);
run('prom/blackbox-exporter:v0.28.0', '/bin/blackbox_exporter', [
  '--config.file=/etc/prometheus/blackbox.yml',
  '--config.check',
]);
