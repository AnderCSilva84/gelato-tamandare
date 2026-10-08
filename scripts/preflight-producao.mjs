import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Read-only operational prerequisite check; never invokes a migration.
const args = process.argv.slice(2);
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const projectId = option('--project');
if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId || '') || args.includes('--apply')) throw new Error('Informe --project. Este verificador nao aceita --apply.');
const token = (process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).trim();
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
async function list(collection, fields) {
  let pageToken;
  const rows = [], seen = new Set();
  do {
    const params = new URLSearchParams({ pageSize: '1000', ...(pageToken ? { pageToken } : {}) });
    fields.forEach(field => params.append('mask.fieldPaths', field));
    const result = await fetch(`${base}/${collection}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!result.ok) throw new Error(`Preflight: HTTP ${result.status}. Conteudo omitido.`);
    const page = await result.json();
    rows.push(...(page.documents || []));
    pageToken = page.nextPageToken;
    if (pageToken && seen.has(pageToken)) throw new Error('Paginacao repetida.');
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  return rows;
}
const [boxes, people] = await Promise.all([
  list('caixas', ['status', 'versaoFinanceira', 'data']),
  list('atendentes', ['role', 'uid', 'authUid', 'senha']),
]);
const value = (doc, field) => { const v = doc.fields?.[field]; return v?.stringValue ?? v?.integerValue; };
const open = boxes.filter(doc => value(doc, 'status') === 'aberto');
const dates = {};
open.forEach(doc => { const date = value(doc, 'data') || 'sem data'; dates[date] = (dates[date] || 0) + 1; });
const legacyOpen = open.filter(doc => value(doc, 'versaoFinanceira') !== '2').length;
const report = {
  projectId, verificadoEm: new Date().toISOString(), somenteLeitura: true,
  caixasAbertos: open.length, caixasLegadosAbertos: legacyOpen, caixasAbertosPorData: dates,
  atendentes: people.length, semAuthUid: people.filter(doc => !value(doc, 'authUid')).length,
  comSenhaLegada: people.filter(doc => !!value(doc, 'senha')).length,
  semRoleValida: people.filter(doc => !['atendente', 'gerencia', 'superadmin'].includes(value(doc, 'role'))).length,
  semLoja: people.filter(doc => !value(doc, 'uid')).length,
  bloqueioPorCaixaLegado: legacyOpen > 0,
  // This check does not approve credential ownership or total reconciliation.
  verificacaoCompletaDeMigracao: false, dadosPessoaisNoRelatorio: false,
};
if (option('--output')) writeFileSync(option('--output'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
