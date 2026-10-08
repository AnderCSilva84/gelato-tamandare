import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildAtendenteEmail } from '../src/utils/loginAtendente.js';

const target = process.argv[2];
if (!/^pdv-acs-homolog-\d{8}$/.test(target || '') || !process.argv.includes('--apply')) throw new Error('Informe projeto de homologacao e --apply.');
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Nao executar com emuladores configurados.');
const source = 'gelato-cb6fd';
const token = execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const credential = applicationDefault();
async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': target, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const code = /^([A-Z][A-Z_0-9]+)/.exec(failure.error?.message || '')?.[1] || 'API_ERROR';
    throw new Error(`Homologacao HTTP ${response.status}: ${code}. Sem dados pessoais no erro.`);
  }
  return response.json();
}
const appsUrl = `https://firebase.googleapis.com/v1beta1/projects/${target}/webApps`;
const apps = await request(appsUrl);
let webApp = (apps.apps || []).find(app => app.displayName === 'PDV ACS Homologacao');
if (!webApp) {
  let op = await request(appsUrl, 'POST', { displayName: 'PDV ACS Homologacao' });
  for (let i = 0; i < 60 && !op.done; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    op = await request(`https://firebase.googleapis.com/v1beta1/${op.name}`);
  }
  if (!op.done || op.error) throw new Error('Aplicativo web nao inicializado.');
  webApp = op.response;
}
const config = await request(`https://firebase.googleapis.com/v1beta1/${webApp.name}/config`);
if (config.projectId !== target) throw new Error('Configuracao aponta para outro projeto.');
await request(`https://identitytoolkit.googleapis.com/admin/v2/projects/${target}/config?updateMask=signIn.email,client.permissions`, 'PATCH', { signIn: { email: { enabled: true, passwordRequired: true } }, client: { permissions: { disabledUserSignup: true, disabledUserDeletion: true } } });
await request(`https://firebasestorage.googleapis.com/v1alpha/projects/${target}/defaultBucket`, 'POST', { location: 'southamerica-east1' });
config.storageBucket = `${target}.firebasestorage.app`;
mkdirSync('.private-backups', { recursive: true });
writeFileSync('.private-backups/homolog-web-config.json', JSON.stringify(config, null, 2));

const sourceDb = getFirestore(initializeApp({ projectId: source, credential }, 'homolog-source-readonly'));
const db = getFirestore(initializeApp({ projectId: target, credential }, 'homolog-target'));
if (!(await db.collection('configuracoes').doc('homologacao').get()).exists) {
  for (const name of ['lojas', 'produtos', 'atendentes', 'acessos_painel', 'vendas', 'caixas']) {
    if (!(await db.collection(name).limit(1).get()).empty) throw new Error('Banco destino nao esta vazio. Recusar carga inicial.');
  }
  const [stores, panels, attendees] = await Promise.all(['lojas', 'acessos_painel', 'atendentes'].map(name => sourceDb.collection(name).get()));
  const accounts = await request(`https://identitytoolkit.googleapis.com/v1/projects/${target}/accounts:batchGet?maxResults=1000`);
  const users = accounts.users || [];
  if (accounts.nextPageToken) throw new Error('Contas excedem o limite da homologacao.');
  const confirmed = JSON.parse(readFileSync('.private-backups/vinculos-gerencia-confirmados.json', 'utf8'));
  if (confirmed.projectId !== source || confirmed.autorizacaoIdentidadeConfirmada !== true) throw new Error('Vinculos administrativos precisam da confirmacao original.');
  const links = new Map(confirmed.vinculos.map(link => [link.atendenteId, link]));
  const writes = [];
  for (const row of stores.docs) {
    const s = row.data();
    writes.push([`lojas/${row.id}`, { nome: s.nome || s.nomeFantasia || row.id, nomeFantasia: s.nomeFantasia || s.nome || row.id, redeId: s.redeId || 'gelato', ativa: true, status: 'ativa', impressaoHabilitada: true, homologacao: true }]);
    writes.push([`produtos/homolog-${row.id}`, { uid: row.id, nome: 'Produto de teste', precoFinal: 10, precoCusto: 4, estoque: 100, unidadeVenda: 'un', ativo: true, homologacao: true }]);
  }
  for (const row of panels.docs) {
    const p = row.data();
    if (!users.some(user => user.localId === row.id)) continue;
    const safe = Object.fromEntries(['role', 'ativo', 'nome', 'email', 'lojaId', 'lojaIds', 'atendenteId', 'podeGerenciarProdutos'].filter(key => p[key] !== undefined).map(key => [key, p[key]]));
    writes.push([`acessos_painel/${row.id}`, { ...safe, homologacao: true }]);
  }
  let createdUsers = 0, verifiedLogins = 0;
  const loginFailures = {};
  for (const row of attendees.docs) {
    const a = row.data(), link = links.get(row.id);
    let user = users.find(u => u.localId === (a.authUid || link?.authUid));
    const email = a.emailAcesso || buildAtendenteEmail(a.uid, a.nome);
    if (!user) {
      const matches = users.filter(u => u.email === email);
      if (matches.length > 1) throw new Error('Identidade ambigua no cadastro de atendente.');
      user = matches[0];
    }
    if (!user) {
      if (a.role !== 'atendente' || typeof a.senha !== 'string' || a.senha.length < 6) throw new Error('Cadastro sem identidade recuperavel.');
      const created = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, 'POST', { targetProjectId: target, email, password: a.senha, displayName: a.nome, disabled: a.ativo === false });
      user = { localId: created.localId, email };
      users.push(user); createdUsers++;
    }
    if (!user.localId || !a.uid) throw new Error('Identidade ou loja ausente.');
    const existing = panels.docs.find(p => p.id === user.localId)?.data();
    const panel = existing ? Object.fromEntries(['role', 'ativo', 'nome', 'email', 'lojaId', 'lojaIds', 'atendenteId', 'podeGerenciarProdutos'].filter(key => existing[key] !== undefined).map(key => [key, existing[key]])) : { role: a.role, ativo: a.ativo !== false, nome: a.nome, lojaId: a.uid, lojaIds: [a.uid], atendenteId: row.id };
    if (link && (panel.role !== 'gerencia' || JSON.stringify([...panel.lojaIds].sort()) !== JSON.stringify([...link.lojaIds].sort()))) throw new Error('Escopo confirmado de gerencia diverge.');
    writes.push([`acessos_painel/${user.localId}`, { ...panel, email: user.email, homologacao: true }]);
    writes.push([`atendentes/${row.id}`, { uid: a.uid, nome: a.nome, role: a.role, ativo: a.ativo !== false, meta: Number(a.meta || 0), authUid: user.localId, emailAcesso: user.email, homologacao: true }]);
    if (a.role === 'atendente' && user.email.endsWith('@acs.local')) writes.push([`logins_atendentes/${buildAtendenteEmail(a.uid, a.nome)}`, { email: user.email }]);
    if (a.authUid && a.ativo !== false && typeof a.senha === 'string' && !users.some(u => u.localId !== user.localId && u.email === user.email)) {
      const signed = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: a.senha, returnSecureToken: true }) });
      const result = await signed.json();
      if (signed.ok && result.localId === user.localId) verifiedLogins++;
      else {
        const code = /^([A-Z][A-Z_0-9]+)/.exec(result.error?.message || '')?.[1] || 'IDENTITY_MISMATCH';
        loginFailures[code] = (loginFailures[code] || 0) + 1;
      }
    }
  }
  writes.push(['configuracoes/operacoes_financeiras', { bloqueadas: false, homologacao: true }]);
  if (!verifiedLogins) throw new Error(`Nenhum login restaurado confirmado: ${JSON.stringify(loginFailures)}. Revisar antes da carga.`);
  writes.push(['configuracoes/homologacao', { target, createdAt: new Date().toISOString(), stores: stores.size, attendees: attendees.size, createdUsers, verifiedLogins, loginFailures, financialDataCopied: false }]);
  const batch = db.batch();
  for (const [path, value] of writes) batch.set(db.doc(path), value);
  await batch.commit();
  console.log(JSON.stringify({ target, stores: stores.size, attendees: attendees.size, createdUsers, verifiedLogins, loginFailures, financialDataCopied: false }));
}
mkdirSync('artifacts/backend-homolog', { recursive: true });
for (const file of readdirSync('functions').filter(file => /\.(js|json)$/.test(file))) copyFileSync(`functions/${file}`, `artifacts/backend-homolog/${file}`);
const backend = readFileSync('functions/index.js', 'utf8');
if (!backend.includes('maxInstances: 10')) throw new Error('Limite do backend precisa de revisao.');
writeFileSync('artifacts/backend-homolog/index.js', backend.replace('maxInstances: 10', 'maxInstances: 1, minInstances: 0, concurrency: 10'));
writeFileSync('artifacts/firebase.homolog.json', JSON.stringify({ firestore: { rules: '../firestore.rules', indexes: '../firestore.indexes.json' }, storage: { rules: '../storage.rules' }, functions: { source: 'backend-homolog', runtime: 'nodejs22' } }, null, 2));
await Promise.all([sourceDb.terminate(), db.terminate()]);
console.log(JSON.stringify({ target, webConfigPrepared: true, backendMaxInstances: 1, backendMinInstances: 0 }));
