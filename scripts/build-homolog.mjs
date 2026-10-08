import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { build } from 'vite';

const config = JSON.parse(readFileSync('.private-backups/homolog-web-config.json', 'utf8'));
if (!/^pdv-acs-homolog-\d{8}$/.test(config.projectId || '') || config.storageBucket !== `${config.projectId}.firebasestorage.app` || !config.appId || !config.apiKey || config.authDomain !== `${config.projectId}.firebaseapp.com`) throw new Error('Configuracao exclusiva de homologacao obrigatoria.');
for (const [key, value] of Object.entries({ VITE_FIREBASE_API_KEY: config.apiKey, VITE_FIREBASE_AUTH_DOMAIN: config.authDomain, VITE_FIREBASE_PROJECT_ID: config.projectId, VITE_FIREBASE_STORAGE_BUCKET: config.storageBucket, VITE_FIREBASE_MESSAGING_SENDER_ID: config.messagingSenderId, VITE_FIREBASE_APP_ID: config.appId, VITE_REDE_ID: '', VITE_LOJA_INICIAL_ID: 'gelato-local', VITE_BUILD_OUT_DIR: 'dist/homolog', VITE_USE_FIREBASE_EMULATORS: 'false' })) {
  if (value === undefined) throw new Error('Configuracao incompleta.');
  process.env[key] = String(value);
}
await build({ mode: 'gelato', build: { outDir: 'dist/homolog', emptyOutDir: true } });
for (const file of readdirSync('dist/homolog/assets').filter(file => file.endsWith('.js'))) {
  if (readFileSync(`dist/homolog/assets/${file}`, 'utf8').includes('gelato-cb6fd')) throw new Error('Build contem referencia ao projeto de producao. Recusar publicacao.');
}
const path = 'dist/homolog/index.html';
const html = readFileSync(path, 'utf8');
writeFileSync(path, html.replace('<title>PDV ACS</title>', '<title>PDV ACS - Homologacao</title>').replace('<body>', '<body><aside role="status" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;text-align:center;background:#fbbf24;color:#111827;font:700 12px/24px Arial;pointer-events:none">HOMOLOGA\u00c7\u00c3O — DADOS DE TESTE</aside>'));
for (const file of ['manifest.json', 'manifest-guajara.json']) {
  const manifest = JSON.parse(readFileSync(`dist/homolog/${file}`, 'utf8'));
  manifest.name = 'PDV ACS - Homologacao'; manifest.short_name = 'ACS Teste';
  writeFileSync(`dist/homolog/${file}`, JSON.stringify(manifest, null, 2));
}
writeFileSync('dist/homolog/_headers', '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
writeFileSync('docs/build-homolog-2026-10-08.json', JSON.stringify({ projectId: config.projectId, output: 'dist/homolog', productionReferenceAbsent: true, testBanner: true, createdAt: new Date().toISOString() }, null, 2));
console.log('Build de homologacao isolado e identificado.');
