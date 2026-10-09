import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

const source = 'gelato-cb6fd', target = 'pdv-acs-homolog-20261008';
const config = JSON.parse(readFileSync('.private-backups/homolog-web-config.json', 'utf8'));
if (config.projectId !== target) throw new Error('Destino de verificacao invalido.');
const token = execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function users(project) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000`, { headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': project } });
  if (!response.ok) throw new Error(`Auth administrativo HTTP ${response.status}.`);
  const data = await response.json();
  if (data.nextPageToken) throw new Error('Revisao exige paginacao adicional.');
  return data.users || [];
}
const db = getFirestore(initializeApp({ projectId: source, credential: applicationDefault() }));
const [sourceUsers, targetUsers, attendees, panels, stores] = await Promise.all([users(source), users(target), db.collection('atendentes').get(), db.collection('acessos_painel').get(), db.collection('lojas').get()]);
const backupReport = JSON.parse(readFileSync('docs/backup-auth-2026-10-08.json', 'utf8'));
const saved = await fetch(`https://storage.googleapis.com/storage/v1/b/${backupReport.bucket}/o/${encodeURIComponent(backupReport.object)}?alt=media&generation=${backupReport.verification.generation}`, { headers: { Authorization: `Bearer ${token}` } });
if (!saved.ok) throw new Error('Backup de referencia indisponivel.');
const bytes = Buffer.from(await saved.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== backupReport.sha256) throw new Error('Backup de referencia invalido.');
const originalUsers = JSON.parse(bytes).users;
const byEmail = new Map();
for (const u of sourceUsers) {
  const email = (u.email || '').toLowerCase();
  if (email) byEmail.set(email, [...(byEmail.get(email) || []), u]);
}
const duplicates = [...byEmail.values()].filter(group => group.length > 1).map(group => group.map(u => ({ uid: u.localId, disabled: !!u.disabled, hasPassword: !!u.passwordHash, providers: (u.providerUserInfo || []).map(p => p.providerId), attendeeLinks: attendees.docs.filter(a => a.data().authUid === u.localId).map(a => ({ id: a.id, nome: a.data().nome, loja: a.data().uid })), panel: panels.docs.find(p => p.id === u.localId)?.data()?.role || null })));
const failures = [], verified = [], inconsistent = [];
for (const row of attendees.docs) {
  const a = row.data();
  if (!a.authUid) continue;
  const u = sourceUsers.find(user => user.localId === a.authUid), restored = targetUsers.find(user => user.localId === a.authUid);
  const original = originalUsers.find(user => user.localId === a.authUid);
  // Imported accounts can be rehashed by the destination after signing in.
  // Compare production with the immutable backup, never with rehashed users.
  if (!u || !restored || !original || u.passwordHash !== original.passwordHash || (u.salt || '') !== (original.salt || '')) { inconsistent.push({ nome: a.nome, loja: a.uid, reason: 'Auth atual diverge do backup original' }); continue; }
  if (a.ativo === false || u.disabled || typeof a.senha !== 'string') continue;
  if ((byEmail.get(u.email?.toLowerCase()) || []).length !== 1) { inconsistent.push({ nome: a.nome, loja: a.uid, reason: 'Email ambiguo de conta vinculada' }); continue; }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: a.senha, returnSecureToken: true }) });
  const data = await response.json();
  const result = { id: row.id, nome: a.nome, role: a.role, loja: stores.docs.find(s => s.id === a.uid)?.data()?.nome || a.uid };
  if (response.ok && data.localId === u.localId) verified.push(result);
  else failures.push({ ...result, code: /^([A-Z][A-Z_0-9]+)/.exec(data.error?.message || '')?.[1] || 'IDENTITY_MISMATCH' });
}
const privateReport = { source, target, duplicates, failures, inconsistent, verified, createdAt: new Date().toISOString() };
writeFileSync('.private-backups/access-review-details.json', JSON.stringify(privateReport, null, 2));
const report = { source, target, authAccounts: sourceUsers.length, verifiedPasswordLogins: verified.length, failures, inconsistencies: inconsistent, duplicateGroups: duplicates.map(group => ({ users: group.length, linkedAttendees: group.reduce((n, u) => n + u.attendeeLinks.length, 0), linkedPanels: group.filter(u => u.panel).length, passwordUsers: group.filter(u => u.hasPassword).length, providers: [...new Set(group.flatMap(u => u.providers))] })), productionModified: false, createdAt: privateReport.createdAt };
writeFileSync('docs/access-review-2026-10-08.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await db.terminate();
