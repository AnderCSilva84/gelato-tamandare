import { createHash } from 'node:crypto';

// Read production only; every mutation targets the dedicated rescue bucket.
export async function backupStorage({ projectId, accessToken, apply = false, fetchApi = fetch, date = new Date() }) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new Error('Projeto invalido.');
  const source = `${projectId}.firebasestorage.app`, destination = `${projectId}-resgate`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const base = 'https://storage.googleapis.com/storage/v1';
  async function json(url, body) {
    const result = await fetchApi(url, { headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
    if (!result.ok) throw new Error(`Backup Storage: HTTP ${result.status}. Nomes e conteudos omitidos.`);
    return result.json();
  }
  const bucket = await json(`${base}/b/${destination}`);
  if (bucket.iamConfiguration?.publicAccessPrevention !== 'enforced' || bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true) throw new Error('Destino precisa ser privado com IAM uniforme.');
  const objects = [], pages = new Set();
  let pageToken;
  do {
    const params = new URLSearchParams({ maxResults: '1000', fields: 'nextPageToken,items(name,size,generation,crc32c,contentType)', ...(pageToken ? { pageToken } : {}) });
    const page = await json(`${base}/b/${source}/o?${params}`);
    objects.push(...(page.items || []));
    pageToken = page.nextPageToken;
    if (pageToken && pages.has(pageToken)) throw new Error('Paginacao repetida.');
    if (pageToken) pages.add(pageToken);
    if (objects.length > 5000) throw new Error('Mais de 5000 objetos: planejar volume antes de copiar.');
  } while (pageToken);
  for (const o of objects) {
    if (!o.name || !/^\d+$/.test(o.size || '') || !/^\d+$/.test(o.generation || '') || !o.crc32c) throw new Error('Inventario incompleto.');
  }
  const bytes = objects.reduce((total, o) => total + Number(o.size), 0);
  if (bytes > 1024 ** 3) throw new Error('Mais de 1 GiB: planejar custo antes de copiar.');
  const createdAt = date.toISOString();
  const prefix = `storage/${createdAt.replace(/[:.]/g, '-')}`;
  const report = { projectId, createdAt, source, destination, objects: objects.length, bytes, notasFiscais: objects.filter(o => o.name.startsWith('notas_fiscais/')).length, apply, dadosPessoaisNoRelatorio: false };
  if (!apply) return report;
  async function digest(bucketName, name, generation, authenticated = true) {
    const url = `${base}/b/${bucketName}/o/${encodeURIComponent(name)}?alt=media&generation=${generation}`;
    const result = await fetchApi(url, { headers: authenticated ? headers : {} });
    if (!authenticated) {
      if (![401, 403].includes(result.status)) throw new Error('Leitura anonima do backup nao foi negada.');
      return result.status;
    }
    if (!result.ok) throw new Error(`Verificacao de conteudo: HTTP ${result.status}.`);
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of result.body) { hash.update(chunk); size += chunk.length; }
    return { bytes: size, sha256: hash.digest('hex') };
  }
  const entries = [];
  for (const object of objects) {
    // Opaque backup names keep filenames out of accidental public URLs/logs.
    const key = `${prefix}/objects/${createHash('sha256').update(object.name).digest('hex')}`;
    let rewriteToken, copied;
    const seen = new Set();
    do {
      const params = new URLSearchParams({ sourceGeneration: object.generation, ifSourceGenerationMatch: object.generation, ifGenerationMatch: '0', dropContextGroups: 'custom', ...(rewriteToken ? { rewriteToken } : {}) });
      const result = await json(`${base}/b/${source}/o/${encodeURIComponent(object.name)}/rewriteTo/b/${destination}/o/${encodeURIComponent(key)}?${params}`, { contentType: object.contentType || 'application/octet-stream', cacheControl: 'no-store', metadata: {} });
      if (result.done) { copied = result.resource; break; }
      rewriteToken = result.rewriteToken;
      if (!rewriteToken || seen.has(rewriteToken)) throw new Error('Copia nao progrediu.');
      seen.add(rewriteToken);
    } while (rewriteToken);
    if (!copied?.generation || copied.size !== object.size || copied.crc32c !== object.crc32c || Object.keys(copied.metadata || {}).length) throw new Error('Copia divergiu ou preservou metadados de acesso.');
    const originalHash = await digest(source, object.name, object.generation);
    const backupHash = await digest(destination, key, copied.generation);
    if (originalHash.bytes !== Number(object.size) || backupHash.bytes !== originalHash.bytes || backupHash.sha256 !== originalHash.sha256) throw new Error('Conteudo recuperado diverge da origem.');
    await digest(destination, key, copied.generation, false);
    entries.push({ name: object.name, sourceGeneration: object.generation, size: object.size, crc32c: object.crc32c, contentType: object.contentType, backup: key, backupGeneration: copied.generation, sha256: backupHash.sha256 });
  }
  // A manifest is written only after every object passes verification.
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, projectId, source, createdAt, entries }));
  const manifestKey = `${prefix}/manifest.json`;
  const upload = await fetchApi(`https://storage.googleapis.com/upload/storage/v1/b/${destination}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(manifestKey)}`, { method: 'POST', headers, body: manifest });
  if (!upload.ok) throw new Error(`Manifesto: HTTP ${upload.status}.`);
  const saved = await upload.json();
  if (!saved.generation) throw new Error('Manifesto sem geracao.');
  const manifestHash = await digest(destination, manifestKey, saved.generation);
  if (manifestHash.bytes !== manifest.length || manifestHash.sha256 !== createHash('sha256').update(manifest).digest('hex')) throw new Error('Manifesto gravado diverge.');
  await digest(destination, manifestKey, saved.generation, false);
  return { ...report, manifest: manifestKey, manifestGeneration: saved.generation, manifestSha256: manifestHash.sha256, conteudosVerificados: entries.length, leituraAnonimaNegada: true, origemAlterada: false, snapshotAtomico: false };
}
