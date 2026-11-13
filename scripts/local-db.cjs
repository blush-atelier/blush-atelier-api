// Solo para WSL local: descubre la IP actual; no la guarda ni modifica .env.
const { execFileSync, spawn } = require('node:child_process');
const { isIP } = require('node:net');
const actions = { migrate: 'migration:run', seed: 'seed', dev: 'start:dev' };
const action = actions[process.argv[2]];
if (!action) {
  console.error('Usa local:migrate, local:seed o local:dev.');
  process.exit(1);
}
let host;
for (const executable of ['docker', '/snap/bin/docker']) {
  try {
    const id = execFileSync(executable, ['compose', 'ps', '-q', 'db'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    }).trim();
    if (!id) continue;
    host = execFileSync(
      executable,
      [
        'inspect',
        '--format',
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
        id,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
    ).trim();
    if (isIP(host)) break;
  } catch {
    host = undefined;
  }
}
if (!host || !isIP(host)) {
  console.error(
    'PostgreSQL local no disponible. Ejecuta docker compose up -d db.',
  );
  process.exit(1);
}
const child = spawn('npm', ['run', action], {
  stdio: 'inherit',
  env: { ...process.env, POSTGRES_HOST: host, POSTGRES_PORT: '5432' },
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('No se pudo ejecutar npm.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code === null ? 1 : code;
});
