import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const target = process.argv[2];
const apply = process.argv.includes('--apply');
if (!/^pdv-acs-homolog-\d{8}$/.test(target || '')) throw new Error('Destino deve ser um projeto exclusivo de homologacao.');
const report = JSON.parse(readFileSync('docs/backup-auth-2026-10-08.json', 'utf8'));
if (target === report.projectId) throw new Error('Restauracao em producao proibida.');
const token = execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': target }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const code = /^([A-Z][A-Z_0-9]+)/.exec(failure.error?.message || '')?.[1] || 'API_ERROR';
    throw new Error(`Consulta ${method} retornou HTTP ${response.status}: ${code}. Nenhum segredo registrado.`);
  }
  return response.json();
}
async function operation(op) {
  for (let i = 0; i < 60 && !op.done; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    op = await request(`https://firebase.googleapis.com/v1beta1/${op.name}`);
  }
  if (!op.done || op.error) throw new Error('Inicializacao Firebase nao concluida.');
  return op.response;
}
if (apply) {
  if (process.argv.includes('--initialize-firebase')) {
    await operation(await request(`https://firebase.googleapis.com/v1beta1/projects/${target}:addFirebase`, 'POST', {}));
  }
  const existing = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${target}`, { headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': target } });
  if (existing.status === 404) await operation(await request(`https://firebase.googleapis.com/v1beta1/projects/${target}:addFirebase`, 'POST', {}));
  else if (!existing.ok) throw new Error(`Consulta Firebase HTTP ${existing.status}.`);
}
const url = `https://storage.googleapis.com/storage/v1/b/${report.bucket}/o/${encodeURIComponent(report.object)}?alt=media&generation=${report.verification.generation}`;
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`Backup privado HTTP ${response.status}.`);
const bytes = Buffer.from(await response.arrayBuffer());
if (bytes.length !== report.bytes || createHash('sha256').update(bytes).digest('hex') !== report.sha256) throw new Error('Integridade do backup invalida.');
const backup = JSON.parse(bytes);
if (backup.projectId !== report.projectId || backup.users.length !== report.users || backup.hashConfig.algorithm !== 'SCRYPT') throw new Error('Formato do backup inesperado.');
if (new Set(backup.users.map(user => user.localId)).size !== backup.users.length) throw new Error('Backup com identificadores duplicados.');
const duplicateEmails = backup.users.length - new Set(backup.users.map(user => user.email)).size;
if (!apply) {
  console.log(JSON.stringify({ target, users: backup.users.length, integrityVerified: true, applied: false }));
} else {
  const endpoint = `https://identitytoolkit.googleapis.com/v1/projects/${target}/accounts`;
  if (process.argv.includes('--initialize-auth')) await request(`https://identitytoolkit.googleapis.com/v2/projects/${target}/identityPlatform:initializeAuth`, 'POST', {});
  const before = await request(`${endpoint}:batchGet?maxResults=1000`);
  if ((before.users || []).length || before.nextPageToken) throw new Error('Destino deve estar vazio. Nao sobrescrever contas.');
  const h = backup.hashConfig;
  // Legacy Auth can contain duplicate emails. Preserve all original UIDs in
  // this empty recovery target; never merge identities or overwrite users.
  const imported = await request(`${endpoint}:batchCreate`, 'POST', { users: backup.users, hashAlgorithm: h.algorithm, signerKey: h.signerKey, saltSeparator: h.saltSeparator, rounds: h.rounds, memoryCost: h.memoryCost, sanityCheck: duplicateEmails === 0, allowOverwrite: false });
  if (imported.error?.length) throw new Error(`Importacao com ${imported.error.length} falhas. Verificar destino antes de repetir.`);
  const after = await request(`${endpoint}:batchGet?maxResults=1000`);
  const actual = new Map((after.users || []).map(user => [user.localId, user]));
  if (actual.size !== backup.users.length || after.nextPageToken) throw new Error('Contagem restaurada diverge.');
  for (const user of backup.users) {
    const recovered = actual.get(user.localId);
    if (!recovered || user.email !== recovered.email || Boolean(user.disabled) !== Boolean(recovered.disabled) || user.passwordHash !== recovered.passwordHash || (user.salt || '') !== (recovered.salt || '') || (user.customAttributes || '') !== (recovered.customAttributes || '')) throw new Error('Conta restaurada diverge do backup.');
  }
  const result = { target, source: report.projectId, users: actual.size, duplicateEmailsPreserved: duplicateEmails, backupIntegrityVerified: true, identifiersAndHashesVerified: true, productionModified: false, createdAt: new Date().toISOString() };
  writeFileSync('docs/restore-auth-homolog-2026-10-08.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
