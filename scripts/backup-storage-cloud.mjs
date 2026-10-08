import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { backupStorage } from '../functions/backup-storage.js';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const projectId = option('--project');
if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId || '')) throw new Error('Informe --project explicitamente.');
const token = (process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
const report = await backupStorage({ projectId, accessToken: token, apply: args.includes('--apply') });
if (option('--output')) writeFileSync(option('--output'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
