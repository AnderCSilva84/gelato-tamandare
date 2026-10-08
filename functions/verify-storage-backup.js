import { createHash } from 'node:crypto';

// Recovery check reads the rescue bucket only, even if the source no longer exists.
export async function verifyStorageBackup({ projectId, accessToken, report, fetchApi = fetch }) {
  const bucket = `${projectId}-resgate`;
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId) || report.projectId !== projectId || report.destination !== bucket || report.apply !== true || !/^storage\/[0-9TZ-]+\/manifest\.json$/.test(report.manifest || '') || !/^\d+$/.test(report.manifestGeneration || '') || !/^[a-f0-9]{64}$/.test(report.manifestSha256 || '')) throw new Error('Relatorio de backup invalido.');
  const prefix = report.manifest.slice(0, -'manifest.json'.length);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const base = `https://storage.googleapis.com/storage/v1/b/${bucket}`;
  const meta = await fetchApi(base, { headers });
  if (!meta.ok) throw new Error(`Consulta do destino: HTTP ${meta.status}.`);
  const config = await meta.json();
  if (config.iamConfiguration?.publicAccessPrevention !== 'enforced' || config.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true) throw new Error('Destino deixou de atender a politica de acesso privado.');
  const response = await fetchApi(`${base}/o/${encodeURIComponent(report.manifest)}?alt=media&generation=${report.manifestGeneration}`, { headers });
  if (!response.ok) throw new Error(`Leitura do manifesto: HTTP ${response.status}.`);
  const raw = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(raw).digest('hex') !== report.manifestSha256) throw new Error('Manifesto diverge do checksum registrado.');
  const manifest = JSON.parse(raw);
  if (manifest.schemaVersion !== 1 || manifest.projectId !== projectId || manifest.source !== `${projectId}.firebasestorage.app` || !Array.isArray(manifest.entries) || manifest.entries.length !== report.objects) throw new Error('Manifesto nao corresponde ao relatorio.');
  const seen = new Set();
  let bytes = 0;
  for (const entry of manifest.entries) {
    if (!entry.backup?.startsWith(`${prefix}objects/`) || !/^[a-f0-9]{64}$/.test(entry.backup.slice(`${prefix}objects/`.length)) || !/^\d+$/.test(entry.backupGeneration || '') || !/^\d+$/.test(entry.size || '') || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || seen.has(entry.backup)) throw new Error('Entrada de recuperacao invalida.');
    seen.add(entry.backup);
    const object = await fetchApi(`${base}/o/${encodeURIComponent(entry.backup)}?alt=media&generation=${entry.backupGeneration}`, { headers });
    if (!object.ok) throw new Error(`Leitura da copia: HTTP ${object.status}.`);
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of object.body) { hash.update(chunk); size += chunk.length; }
    if (size !== Number(entry.size) || hash.digest('hex') !== entry.sha256) throw new Error('Copia nao corresponde ao manifesto.');
    bytes += size;
  }
  if (bytes !== report.bytes) throw new Error('Tamanho total diverge.');
  return { projectId, bucket, verificadoEm: new Date().toISOString(), objetosRecuperados: seen.size, bytes, manifestoEConteudosConferidos: true, somenteBucketDeBackup: true, escritaRealizada: false, dadosPessoaisNoRelatorio: false };
}
