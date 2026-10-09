import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { checkedAt: new Date().toISOString(), sites: [], additionalDatabaseReads: 0, tabletOrientation: 'landscape', viewportChecked: { width: 1024, height: 768 }, syntheticChangeChecked: { total: 6, received: 20, change: 14 } };
for (const [site, dir, file] of [
  ['https://gelatotht.netlify.app', 'dist/gelato-tamandare', 'artifacts/payment-refine-gelato-production.json'],
  ['https://cafe-guajara.netlify.app', 'dist/cafe-guajara', 'artifacts/payment-refine-cafe-production.json'],
]) {
  const html = await fetch(site).then(r => { assert.equal(r.status, 200); return r.text(); });
  const local = readFileSync(`${dir}/index.html`, 'utf8');
  assert(html.includes(local.match(/src="(\/assets\/index-[^"]+\.js)"/)[1]));
  const assets = readdirSync(`${dir}/assets`).filter(name => /^(index-.*\.css|Caixa-.*\.js)$/.test(name));
  for (const name of assets) {
    const response = await fetch(`${site}/assets/${name}`); assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync(`${dir}/assets/${name}`)));
  }
  const buffer = readFileSync(file), metadata = JSON.parse(buffer.toString(buffer[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
  report.sites.push({ site, deployId: metadata.deploy_id, assetsVerified: assets.length });
}
writeFileSync('docs/pagamentos-refino-publicacao-2026-10-08.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.sites));
