import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';

const projectId = process.argv[2];
if (projectId !== 'pdv-acs-homolog-20261008') throw Error('Somente homologacao isolada.');
const app = initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore(app), auth = getAuth(app);
const uid = 'pwa-visual-review', store = 'gelato-local';
const paths = [`atendentes/${uid}`, `acessos_painel/${uid}`, `caixas/${uid}`, ...['a', 'b', 'c'].map(id => `produtos/${uid}-produto-${id}`), ...Array.from({ length: 14 }, (_, i) => `vendas/${uid}-${i}`)];
if (process.argv.includes('--cleanup')) {
  const batch = db.batch(); paths.forEach(p => batch.delete(db.doc(p))); await batch.commit();
  await auth.deleteUser(uid).catch(e => { if (e.code !== 'auth/user-not-found') throw e; });
  if (existsSync('.private-backups/pwa-visual-credentials.json')) unlinkSync('.private-backups/pwa-visual-credentials.json');
  console.log('Conta e registros ficticios desta verificacao removidos da homologacao.');
} else if (process.argv.includes('--apply')) {
  if ((await db.doc(`atendentes/${uid}`).get()).exists) throw Error('Verificacao existente: recusar sobrescrita.');
  // Temporary synthetic credentials, restricted to a fake-data project and deleted after QA.
  const password = process.argv.includes('--visual-demo') ? 'SomenteHomologacao2026!' : randomBytes(24).toString('base64url');
  await auth.createUser({ uid, email: 'pwa-visual@example.test', password, displayName: 'Previa visual' });
  writeFileSync('.private-backups/pwa-visual-credentials.json', JSON.stringify({ projectId, email: 'pwa-visual@example.test', password }));
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const batch = db.batch();
  for (const [index, name] of ['Casquinha ficticia', 'Agua ficticia', 'Produto sem giro'].entries()) batch.create(db.doc(`produtos/${uid}-produto-${'abc'[index]}`), { uid: store, nome: name, precoFinal: index === 0 ? 6 : 4, preco: index === 0 ? 6 : 4, precoCusto: 1, estoque: 100, unidadeVenda: 'un', ativo: true, criadoEm: Timestamp.fromMillis(Date.now() - 45 * 86400000) });
  batch.create(db.doc(`atendentes/${uid}`), { uid: store, nome: 'Previa visual', role: 'gerencia', ativo: true, authUid: uid, emailAcesso: 'pwa-visual@example.test', meta: 0 });
  batch.create(db.doc(`acessos_painel/${uid}`), { atendenteId: uid, nome: 'Previa visual', role: 'gerencia', ativo: true, lojaId: store, lojaIds: [store, 'sorveteria-e-acai'] });
  batch.create(db.doc(`caixas/${uid}`), { uid: store, data: day, status: 'aberto', atendenteId: uid, atendenteNome: 'Previa visual', versaoFinanceira: 2, fundoCaixa: 50, totalVendas: 0, totalItens: 0, abertoEm: Timestamp.now() });
  for (let i = 0; i < 14; i++) {
    const date = `${day.slice(0, 8)}${String(i % 7 + 1).padStart(2, '0')}`;
    batch.create(db.doc(`vendas/${uid}-${i}`), { uid: store, data: date, horario: `${i < 7 ? '14' : '18'}:30`, valor: 10 + i * 5, quantidade: i < 10 ? 2 : 1, produtoId: `${uid}-produto-${i < 10 ? 'a' : 'b'}`, produto: i < 10 ? 'Casquinha ficticia' : 'Agua ficticia', atendenteId: uid, atendenteNome: 'Previa visual', vendaGrupoId: `${uid}-pedido-${i}`, status: 'ativa' });
  }
  await batch.commit(); console.log('Dados ficticios preparados apenas na homologacao isolada.');
} else throw Error('Informe --apply ou --cleanup.');
await db.terminate();
