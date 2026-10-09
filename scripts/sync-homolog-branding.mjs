import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';

const target = process.argv[2];
if (!/^pdv-acs-homolog-\d{8}$/.test(target || '') || !process.argv.includes('--apply')) throw new Error('Informe somente projeto de homologacao e --apply.');
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Nao executar com emulador.');
const credential = applicationDefault();
const source = getFirestore(initializeApp({ projectId: 'gelato-cb6fd', credential }, 'branding-source-readonly'));
const db = getFirestore(initializeApp({ projectId: target, credential }, 'branding-target'));
const stores = await source.collection('lojas').get();
const batch = db.batch(), report = [];
for (const row of stores.docs) {
  const s = row.data(), ref = db.doc(`lojas/${row.id}`);
  if (!(await ref.get()).exists) throw new Error('Loja ausente na homologacao.');
  if (!['gelato', 'emporio'].includes(s.redeId)) throw new Error('Rede da loja precisa de revisao.');
  const visual = {};
  for (const key of ['logomarca', 'imagemCapaPdv']) {
    const value = String(s[key] || '');
    if (value && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(value)) throw new Error('Imagem externa precisa de copia isolada.');
    visual[key] = value;
  }
  batch.update(ref, { ...visual, redeId: s.redeId });
  report.push({ id: row.id, redeId: s.redeId, logoPreserved: !!visual.logomarca, coverPreserved: !!visual.imagemCapaPdv });
}
await batch.commit();
for (const row of stores.docs) {
  const actual = (await db.doc(`lojas/${row.id}`).get()).data();
  for (const key of ['redeId', 'logomarca', 'imagemCapaPdv']) if ((actual[key] || '') !== (row.data()[key] || '')) throw new Error('Identidade visual diverge da origem.');
}
writeFileSync('docs/homolog-branding-2026-10-08.json', JSON.stringify({ target, stores: report, visualVerified: true, productionModified: false }, null, 2));
console.log(JSON.stringify({ target, stores: stores.size, visualVerified: true, productionModified: false }));
await Promise.all([source.terminate(), db.terminate()]);
