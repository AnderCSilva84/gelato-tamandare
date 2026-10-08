import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildAtendenteEmail } from '../src/utils/loginAtendente.js';
import { validarVinculoGerencia } from '../functions/migration-links.js';

const args = process.argv.slice(2), apply = args.includes('--apply');
if (apply && args.includes('--dry-run')) throw new Error('--dry-run e --apply sao mutuamente exclusivos.');
const projectId = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !projectId || projectId.startsWith('--')) throw new Error('Informe --project explicitamente. Sem --apply, apenas verifica.');
const confirmationPath = args.includes('--vinculos-confirmados') ? args[args.indexOf('--vinculos-confirmados') + 1] : null;
const confirmations = new Map();
let identityConfirmed = true;
if (confirmationPath) {
  const data = JSON.parse(readFileSync(confirmationPath, 'utf8'));
  if (data.projectId !== projectId || !Array.isArray(data.vinculos)) throw new Error('Confirmacoes precisam pertencer ao projeto informado.');
  identityConfirmed = data.autorizacaoIdentidadeConfirmada === true;
  if (apply && !identityConfirmed) throw new Error('Identidade da conta compartilhada ainda nao confirmada. Nenhuma alteracao permitida.');
  for (const link of data.vinculos) {
    if (!link.atendenteId || !link.authUid || !Array.isArray(link.lojaIds) || confirmations.has(link.atendenteId)) throw new Error('Vinculo confirmado invalido ou repetido.');
    confirmations.set(link.atendenteId, link);
  }
}
const credential = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ? cert(JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'))) : applicationDefault();
initializeApp({ projectId, credential });
const db = getFirestore(), auth = getAuth();
const open = await db.collection('caixas').where('status', '==', 'aberto').get();
if (open.docs.some(doc => doc.data().versaoFinanceira !== 2)) throw new Error('Concilie e feche todos os caixas legados antes de migrar. Nenhuma alteracao feita.');
const attendees = await db.collection('atendentes').get();
let migrated = 0, unresolved = 0;
for (const doc of attendees.docs) {
  const a = doc.data();
  let user;
  const email = a.emailAcesso || buildAtendenteEmail(a.uid, a.nome);
  if (!a.uid || !['atendente', 'gerencia', 'superadmin'].includes(a.role)) { unresolved++; continue; }
  try {
    if (a.authUid) user = await auth.getUser(a.authUid);
    else {
      try {
        const existingUser = await auth.getUserByEmail(email);
        const existingPanel = (await db.doc(`acessos_painel/${existingUser.uid}`).get()).data();
        if (!validarVinculoGerencia({ cadastroId: doc.id, cadastro: a, usuario: existingUser, painel: existingPanel, confirmacao: confirmations.get(doc.id) })) { unresolved++; continue; }
        user = existingUser;
      }
      catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
      if (!user) {
        if (confirmations.has(doc.id) || typeof a.senha !== 'string' || a.senha.length < 6) { unresolved++; continue; }
        if (apply) user = await auth.createUser({ uid: `gelato_${createHash('sha256').update(doc.id).digest('hex').slice(0, 40)}`, email, password: a.senha, displayName: a.nome, disabled: a.ativo === false });
      }
    }
    if (user && a.emailAcesso && user.email?.toLowerCase() !== a.emailAcesso.toLowerCase()) { unresolved++; continue; }
    if (apply) {
      const panel = db.doc(`acessos_painel/${user.uid}`);
      await db.runTransaction(async tx => {
        const existing = (await tx.get(panel)).data();
        if (a.role === "atendente" && user.email.endsWith("@acs.local")) tx.set(db.doc(`logins_atendentes/${buildAtendenteEmail(a.uid, a.nome)}`), { email: user.email });
        tx.update(doc.ref, { senha: FieldValue.delete(), authUid: user.uid, emailAcesso: user.email, credenciaisMigradasEm: FieldValue.serverTimestamp() });
        tx.set(panel, { ...(!existing ? { atendenteId: doc.id, nome: a.nome, role: a.role, lojaId: a.uid, lojaIds: [a.uid] } : {}), ativo: a.ativo !== false && !user.disabled, email: user.email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    }
    migrated++;
  } catch (error) { unresolved++; console.error(`Cadastro ${doc.id}: ${error.code || 'falha'}. Nenhuma senha exibida.`); }
}
console.log(JSON.stringify({ projectId, modo: apply ? 'aplicacao' : 'simulacao', cadastros: attendees.size, migraveisOuMigrados: migrated, pendencias: unresolved, vinculosAguardandoConfirmacaoDeIdentidade: identityConfirmed ? 0 : confirmations.size }));
if (unresolved) process.exitCode = 1;
await db.terminate();
