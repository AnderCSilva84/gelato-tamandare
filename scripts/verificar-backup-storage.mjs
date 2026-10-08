import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verifyStorageBackup } from '../functions/verify-storage-backup.js';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const projectId = option('--project'), input = option('--report');
if (!input || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId || '')) throw new Error('Informe --project e --report explicitamente.');
const report = JSON.parse(readFileSync(input, 'utf8'));
const token = (process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
const verification = await verifyStorageBackup({ projectId, accessToken: token, report });
if (option('--output')) writeFileSync(option('--output'), JSON.stringify(verification, null, 2) + '\n');
console.log(JSON.stringify(verification, null, 2));
