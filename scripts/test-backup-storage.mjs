import assert from 'node:assert/strict';
import { backupStorage } from '../functions/backup-storage.js';
import { verifyStorageBackup } from '../functions/verify-storage-backup.js';

const fixture = [
  { name: 'notas_fiscais/ficticio/nota.pdf', size: '8', generation: '11', crc32c: 'fixture1', contentType: 'application/pdf', body: '%PDFtest' },
  { name: 'fotos/ficticio.png', size: '7', generation: '12', crc32c: 'fixture2', contentType: 'image/png', body: 'imagem!' },
];
function scenario({ mismatch = false, publicBucket = false, publicObject = false, missingSource = false } = {}) {
  const copies = new Map(), calls = [];
  let uploads = 0;
  const response = data => new Response(JSON.stringify(data), { status: 200 });
  const fetchApi = async (raw, options = {}) => {
    const url = new URL(raw), path = url.pathname;
    calls.push({ url, options });
    if (path.endsWith('/b/demo-test-resgate')) return response({ iamConfiguration: { publicAccessPrevention: publicBucket ? 'inherited' : 'enforced', uniformBucketLevelAccess: { enabled: true } } });
    if (path.endsWith('/b/demo-test.firebasestorage.app/o')) {
      const o = fixture[url.searchParams.has('pageToken') ? 1 : 0];
      const { body: _body, ...metadata } = o;
      return response({ items: [metadata], ...(!url.searchParams.has('pageToken') ? { nextPageToken: 'page2' } : {}) });
    }
    if (path.includes('/rewriteTo/')) {
      const [sourcePart, destinationPart] = path.split('/rewriteTo/');
      const sourceName = decodeURIComponent(sourcePart.split('/o/')[1]);
      const o = fixture.find(f => f.name === sourceName);
      assert.equal(url.searchParams.get('sourceGeneration'), o.generation);
      assert.equal(url.searchParams.get('ifGenerationMatch'), '0');
      assert.equal(url.searchParams.get('dropContextGroups'), 'custom');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.metadata, {});
      assert.equal(body.cacheControl, 'no-store');
      if (!url.searchParams.has('rewriteToken')) return response({ done: false, rewriteToken: 'continue' });
      const key = decodeURIComponent(destinationPart.split('/o/')[1]);
      copies.set(key, o.body);
      return response({ done: true, resource: { generation: '99', size: o.size, crc32c: mismatch ? 'wrong' : o.crc32c, metadata: {} } });
    }
    if (url.pathname.startsWith('/upload/')) {
      uploads++;
      assert.equal(url.searchParams.get('ifGenerationMatch'), '0');
      const manifest = JSON.parse(options.body.toString());
      assert.equal(manifest.entries.length, 2);
      assert.ok(manifest.entries.every(e => e.sha256 && e.backupGeneration));
      copies.set(url.searchParams.get('name'), options.body);
      return response({ generation: '100' });
    }
    if (url.searchParams.get('alt') === 'media') {
      if (!options.headers?.Authorization) return publicObject ? new Response('public') : new Response('', { status: 401 });
      const name = decodeURIComponent(path.split('/o/')[1]);
      if (path.includes('firebasestorage.app')) {
        if (missingSource) return new Response('', { status: 404 });
        const o = fixture.find(f => f.name === name);
        assert.equal(url.searchParams.get('generation'), o.generation);
        return new Response(o.body);
      }
      return new Response(copies.get(name));
    }
    throw new Error('Requisicao inesperada no teste.');
  };
  return { fetchApi, calls, uploaded: () => uploads };
}
const params = { projectId: 'demo-test', accessToken: 'fixture-token', date: new Date('2026-10-08T00:00:00Z') };
const plan = scenario();
const planned = await backupStorage({ ...params, fetchApi: plan.fetchApi });
assert.equal(planned.objects, 2);
assert.equal(planned.bytes, 15);
assert.equal(planned.notasFiscais, 1);
assert.ok(plan.calls.every(c => !c.options.body));
const ok = scenario();
const completed = await backupStorage({ ...params, apply: true, fetchApi: ok.fetchApi });
assert.equal(completed.conteudosVerificados, 2);
assert.equal(completed.leituraAnonimaNegada, true);
assert.equal(completed.origemAlterada, false);
assert.ok(!JSON.stringify(completed).includes('nota.pdf'));
assert.ok(!JSON.stringify(completed).includes('fixture-token'));
assert.equal(ok.uploaded(), 1);
const beforeVerification = ok.calls.length;
const recovered = await verifyStorageBackup({ ...params, report: completed, fetchApi: ok.fetchApi });
assert.equal(recovered.objetosRecuperados, 2);
assert.ok(ok.calls.slice(beforeVerification).every(c => !c.url.pathname.includes('firebasestorage.app') && !c.options.body));
await assert.rejects(verifyStorageBackup({ ...params, report: { ...completed, manifestSha256: '0'.repeat(64) }, fetchApi: ok.fetchApi }), /checksum/);
await assert.rejects(verifyStorageBackup({ ...params, report: { ...completed, objects: 3 }, fetchApi: ok.fetchApi }), /corresponde/);
for (const variant of [{ mismatch: true }, { publicBucket: true }, { publicObject: true }, { missingSource: true }]) {
  const bad = scenario(variant);
  await assert.rejects(backupStorage({ ...params, apply: true, fetchApi: bad.fetchApi }));
  assert.equal(bad.uploaded(), 0, 'Nao registrar manifesto de sucesso para copia incompleta.');
}
console.log('Backup Storage: plano sem escrita, paginacao, copia por geracao, metadados sem tokens, SHA-256 e rejeicao de copia incompleta/publica verificados.');
