import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const project = option('--project'), database = option('--database'), output = option('--output');
if (!/^[a-z][a-z0-9-]{4,62}$/.test(project || '') || !/^gelato-homolog-\d{8}(-[a-z0-9]+)?$/.test(database || '')) throw new Error('Somente banco gelato-homolog-AAAAMMDD explicitamente informado e permitido.');
// CLI credential stays in memory. Never place the token in argv, logs or env.
const token = (process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database}`;
async function api(suffix, body) {
  const result = await fetch(`${base}${suffix}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!result.ok) throw new Error(`Firestore retornou HTTP ${result.status}. Nenhum conteudo de documento foi exibido.`);
  return result.json();
}
const info = await api('');
if (info.sourceInfo?.progress !== 'COMPLETED') throw new Error('Restauracao ainda nao concluida. Nenhuma contagem sera apresentada como validada.');
const anonymous = await fetch(`${base}/documents/produtos?pageSize=1`);
if (anonymous.status !== 403) throw new Error(`Leitura anonima retornou HTTP ${anonymous.status}; bloqueio esperado nao confirmado.`);
const counts = {};
for (const collection of ['lojas', 'produtos', 'atendentes', 'acessos_painel', 'vendas', 'caixas', 'retiradas_caixa', 'despesas', 'resumo_diario', 'ranking_diario', 'movimentacoes_estoque']) {
  const result = await api('/documents:runAggregationQuery', { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: collection }] }, aggregations: [{ alias: 'quantidade', count: {} }] } });
  counts[collection] = Number(result[0]?.result?.aggregateFields?.quantidade?.integerValue || 0);
}
const report = { verificadoEm: new Date().toISOString(), projeto: project, banco: database, nomeConfirmado: info.name, regiao: info.locationId, origemRestauracao: info.sourceInfo || null, leituraAnonima: { statusHttp: anonymous.status, negada: true }, contagens: counts, somenteLeitura: true, contemDadosPessoais: false };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
