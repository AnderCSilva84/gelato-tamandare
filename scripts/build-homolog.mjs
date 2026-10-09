import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { build } from 'vite';

const config = JSON.parse(readFileSync('.private-backups/homolog-web-config.json', 'utf8'));
const mode = process.argv[2] || 'gelato';
if (!['gelato', 'cafe-guajara'].includes(mode)) throw new Error('Escolha gelato ou cafe-guajara.');
const cafe = mode === 'cafe-guajara';
const output = cafe ? 'dist/homolog-cafe-guajara' : 'dist/homolog';
if (!/^pdv-acs-homolog-\d{8}$/.test(config.projectId || '') || config.storageBucket !== `${config.projectId}.firebasestorage.app` || !config.appId || !config.apiKey || config.authDomain !== `${config.projectId}.firebaseapp.com`) throw new Error('Configuracao exclusiva de homologacao obrigatoria.');
for (const [key, value] of Object.entries({ VITE_FIREBASE_API_KEY: config.apiKey, VITE_FIREBASE_AUTH_DOMAIN: config.authDomain, VITE_FIREBASE_PROJECT_ID: config.projectId, VITE_FIREBASE_STORAGE_BUCKET: config.storageBucket, VITE_FIREBASE_MESSAGING_SENDER_ID: config.messagingSenderId, VITE_FIREBASE_APP_ID: config.appId, VITE_REDE_ID: cafe ? 'emporio' : 'gelato', VITE_LOJA_INICIAL_ID: cafe ? 'tamandare' : 'gelato-local', VITE_BUILD_OUT_DIR: output, VITE_USE_FIREBASE_EMULATORS: 'false' })) {
  if (value === undefined) throw new Error('Configuracao incompleta.');
  process.env[key] = String(value);
}
await build({ mode, build: { outDir: output, emptyOutDir: true } });
for (const file of readdirSync(`${output}/assets`).filter(file => file.endsWith('.js'))) {
  if (readFileSync(`${output}/assets/${file}`, 'utf8').includes('gelato-cb6fd')) throw new Error('Build contem referencia ao projeto de producao. Recusar publicacao.');
}
const path = `${output}/index.html`;
const html = readFileSync(path, 'utf8');
writeFileSync(path, html.replace('<title>PDV ACS</title>', '<title>PDV ACS - Homologacao</title>').replace('<body>', '<body><aside role="status" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;text-align:center;background:#fbbf24;color:#111827;font:700 12px/24px Arial;pointer-events:none">HOMOLOGA\u00c7\u00c3O — DADOS DE TESTE</aside>'));
for (const file of ['manifest.json', 'manifest-guajara.json']) {
  const manifest = JSON.parse(readFileSync(`${output}/${file}`, 'utf8'));
  manifest.name = cafe ? 'PDV ACS - Cafe Guajara - Homologacao' : 'PDV ACS - Gelato / Sabor & Acai - Homologacao'; manifest.short_name = cafe ? 'Cafe Teste' : 'ACS Teste';
  writeFileSync(`${output}/${file}`, JSON.stringify(manifest, null, 2));
}
writeFileSync(`${output}/_headers`, '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
writeFileSync(`docs/build-homolog-${mode}-2026-10-08.json`, JSON.stringify({ projectId: config.projectId, mode, redeId: process.env.VITE_REDE_ID, output, productionReferenceAbsent: true, testBanner: true, createdAt: new Date().toISOString() }, null, 2));
console.log('Build de homologacao isolado e identificado.');
