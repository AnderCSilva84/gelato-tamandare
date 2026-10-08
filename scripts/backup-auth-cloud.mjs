import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { backupAuth } from '../functions/backup-auth.js';
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const projectId = option('--project'), bucket = option('--bucket'), output = option('--output');
if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId || '') || bucket !== `${projectId}-resgate`) throw new Error('Informe o projeto e seu bucket privado PROJETO-resgate.');
const token = (process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
const metadata = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}`, { headers: { Authorization: `Bearer ${token}` } });
if (!metadata.ok) throw new Error(`Consulta do bucket retornou HTTP ${metadata.status}.`);
const b = await metadata.json();
if (b.iamConfiguration?.publicAccessPrevention !== 'enforced' || b.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true) throw new Error('Bucket precisa bloquear acesso publico e usar IAM uniforme.');
let verification;
const report = await backupAuth({ projectId, accessToken: token, save: async (key, bytes) => {
  const result = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: bytes });
  if (!result.ok) throw new Error(`Gravacao privada retornou HTTP ${result.status}.`);
  const object = await result.json();
  if (!object.generation) throw new Error('Objeto gravado sem geracao confirmada.');
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}?alt=media&generation=${encodeURIComponent(object.generation)}`;
  const read = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!read.ok) throw new Error(`Verificacao do objeto gravado retornou HTTP ${read.status}.`);
  const restored = Buffer.from(await read.arrayBuffer());
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  if (restored.length !== bytes.length || sha256(restored) !== sha256(bytes)) throw new Error('Objeto gravado diverge do backup enviado.');
  const anonymous = await fetch(url);
  if (![401, 403].includes(anonymous.status)) throw new Error(`Bloqueio de leitura anonima nao confirmado: HTTP ${anonymous.status}.`);
  verification = { generation: object.generation, tamanhoEHashConferidos: true, leituraAnonimaNegada: true, statusAnonimo: anonymous.status };
} });
if (output) writeFileSync(output, JSON.stringify({ ...report, bucket, verification, dadosPessoaisNoRelatorio: false }, null, 2) + '\n');
console.log(JSON.stringify({ ...report, bucket, verification, dadosPessoaisNoRelatorio: false }, null, 2));
