import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// This procedure only starts emulators in the demo project; no cloud credentials.
const directory = `artifacts/backup-emulador-${Date.now()}`;
mkdirSync('artifacts', { recursive: true });
function run(mode, flag) {
  const fixtureCommand = `node scripts/test-backup-fixture.mjs ${mode}`;
  const args = ['emulators:exec', '--project', 'demo-gelato-audit', '--only', 'firestore,storage,auth', '--config', 'firebase.audit.json', `${flag}=${directory}`, process.platform === 'win32' ? `"${fixtureCommand}"` : fixtureCommand];
  const result = spawnSync('firebase', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Ensaio ${mode} falhou (${result.status}).`);
}
run('seed', '--export-on-exit');
run('verify', '--import');
console.log(`Ensaio concluido. Apenas dados ficticios: ${directory}`);
