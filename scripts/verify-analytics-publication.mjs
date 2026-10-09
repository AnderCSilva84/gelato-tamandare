import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const report = { checkedAt: new Date().toISOString(), sites: [] };
for (const [site, dir, metadata] of [
  ['https://gelatotht.netlify.app', 'dist/gelato-tamandare', 'artifacts/analytics-gelato-production.json'],
  ['https://cafe-guajara.netlify.app', 'dist/cafe-guajara', 'artifacts/analytics-cafe-production.json'],
]) {
  const html = await fetch(site).then(r => { assert.equal(r.status, 200); return r.text(); });
  const local = readFileSync(`${dir}/index.html`, 'utf8');
  const entry = local.match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
  assert(html.includes(entry), 'A versão publicada deve coincidir com a compilação local.');
  const assets = readdirSync(`${dir}/assets`).filter(name => /^(index-.*\.(js|css)|Caixa-.*\.js|Estoque-.*\.js|Rede-.*\.js|PicosVendas-.*\.js)$/.test(name));
  await Promise.all(assets.map(async name => {
    const response = await fetch(`${site}/assets/${name}`); assert.equal(response.status, 200);
    const deployed = Buffer.from(await response.arrayBuffer());
    assert.equal(hash(deployed), hash(readFileSync(`${dir}/assets/${name}`)), `Conteúdo divergente: ${name}`);
  }));
  const buffer = readFileSync(metadata), deploy = JSON.parse(buffer.toString(buffer[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
  report.sites.push({ site, deployId: deploy.deploy_id, assetsVerified: assets.length });
}
report.historicalPreparation = JSON.parse(readFileSync('docs/analytics-preparacao-gelato-cb6fd.json', 'utf8'));
report.tests = ['lint', 'build:gelato', 'build:cafe-guajara', 'test:seguranca', 'test-analytics', 'test-picos-vendas', 'test-homolog-cloud'];
report.viewportChecks = [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 390, height: 844 }];
report.physicalTabletValidated = false;
writeFileSync('docs/analytics-publicacao-2026-10-08.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.sites));
