import assert from 'node:assert/strict';

// Exclusivamente emulador: nunca aceitar host remoto ou projeto real.
const host = process.env.FIRESTORE_EMULATOR_HOST;
assert.equal(host, '127.0.0.1:8188');
const project = 'demo-gelato-audit';
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
function field(value) {
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, field(item)])) } };
  return { stringValue: String(value) };
}
function token(uid) {
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ iss: `https://securetoken.google.com/${project}`, aud: project, sub: uid, user_id: uid, email: `${uid}@example.test`, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: 'password', identities: {} } })}.`;
}
async function request(path, method = 'GET', data, uid = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (uid) headers.Authorization = `Bearer ${uid === 'owner' ? 'owner' : token(uid)}`;
  return fetch(`${base}/${path}`, { method, headers, body: data ? JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])) }) : undefined });
}
async function seed(path, data) {
  const result = await request(path, 'PATCH', data, 'owner');
  assert.equal(result.status, 200, await result.text());
}
async function check(label, path, method, data, uid, expected) {
  const result = await request(path, method, data, uid);
  assert.equal(result.status, expected, `${label}: ${await result.text()}`);
  console.log(`${label}: HTTP ${result.status}`);
}
await seed('acessos_painel/operador', { role: 'atendente', lojaId: 'loja-a', lojaIds: ['loja-a'], ativo: true });
await seed('acessos_painel/inativo', { role: 'atendente', lojaId: 'loja-a', ativo: false });
await seed('acessos_painel/gestor', { role: 'gerencia', lojaId: 'loja-a', lojaIds: ['loja-a'], ativo: true });
await seed('acessos_painel/outra-loja', { role: 'atendente', lojaId: 'loja-b', lojaIds: ['loja-b'], ativo: true });
await seed('produtos/p1', { uid: 'loja-a', nome: 'Produto', estoque: 5 });
await seed('vendas/v1', { uid: 'loja-a', valor: 20 });
await seed('atendentes/legado', { uid: 'loja-a', role: 'superadmin', authUid: '', nome: 'Legado', senha: 'senha-ficticia-auditoria', meta: 0, ativo: true });
await seed('acessos_painel/admin', { role: 'superadmin', ativo: true });
await seed('conversas/operador', { usuarioUid: 'operador', usuarioEmail: 'operador@example.test' });
await seed('conversas/c1', { usuarioUid: 'outra-pessoa', ultimaMensagemTexto: 'Conteúdo fictício' });
await check('B03 dono le seu suporte', 'conversas/operador', 'GET', null, 'operador', 200);
await check('B04 outro usuario nao le suporte', 'conversas/operador', 'GET', null, 'outra-loja', 403);
await check('B05 superadmin le suporte', 'conversas/operador', 'GET', null, 'admin', 200);
await check('B06 dono envia mensagem', 'conversas/operador/mensagens/m1', 'PATCH', { texto: 'Teste', tipoRemetente: 'usuario', remetente: 'operador@example.test' }, 'operador', 200);
await check('B07 dono nao imita admin', 'conversas/operador/mensagens/m2', 'PATCH', { texto: 'Teste', tipoRemetente: 'admin', remetente: 'admin', adminEmail: 'operador@example.test' }, 'operador', 403);
await check('B01 leitura de produto sem login bloqueada', 'produtos/p1', 'GET', null, null, 403);
await check('B02 leitura de outra loja bloqueada', 'produtos/p1', 'GET', null, 'outra-loja', 403);
await check('F01 suporte lido sem autenticação', 'conversas/c1', 'GET', null, null, 403);
await check('F02 suporte alterado sem autenticação', 'conversas/c1', 'PATCH', { usuarioUid: 'forjado' }, null, 403);
await check('F03 usuário inativo lê dados da loja', 'produtos/p1', 'GET', null, 'inativo', 403);
await check('F04 gravacao direta de senha bloqueada', 'atendentes/legado?updateMask.fieldPaths=senha', 'PATCH', { senha: 'teste-nao-persistir' }, 'gestor', 403);
await check('F05 operador grava estoque negativo sem movimentação', 'produtos/p1?updateMask.fieldPaths=estoque', 'PATCH', { estoque: -99 }, 'operador', 403);
await check('F06 operador exclui venda diretamente', 'vendas/v1', 'DELETE', null, 'operador', 403);
await check('F07 operador cria venda negativa sem caixa', 'vendas/invalida', 'PATCH', { uid: 'loja-a', valor: -500 }, 'operador', 403);
await check('F08 gestor amplia a própria lista de lojas', 'acessos_painel/gestor?updateMask.fieldPaths=lojaIds', 'PATCH', { lojaIds: ['loja-a', 'loja-b'] }, 'gestor', 403);
await check('F09 usuário autenticado reivindica superadmin legado', 'acessos_painel/intruso', 'PATCH', { atendenteId: 'legado', role: 'superadmin', ativo: true }, 'intruso', 403);
await check('G01 gerencia nao altera configuracao do sistema', 'configuracoes/sistema__loja-a', 'PATCH', { uid: 'loja-a', maintenanceMode: true }, 'gestor', 403);
await check('G02 gerencia nao altera bloqueio financeiro global', 'configuracoes/operacoes_financeiras', 'PATCH', { bloqueadas: true }, 'gestor', 403);
await check('G03 superadmin administra configuracao do sistema', 'configuracoes/sistema__loja-a', 'PATCH', { uid: 'loja-a', maintenanceMode: true }, 'admin', 200);
await check('A01 gestor cria produto com giro vazio', 'produtos/analytics-new', 'PATCH', { uid: 'loja-a', nome: 'Novo', estoque: 0, giroInicializado: true, giroDiario: {} }, 'gestor', 200);
await check('A02 gestor nao forja vendas do produto', 'produtos/analytics-new?updateMask.fieldPaths=giroDiario', 'PATCH', { giroDiario: { '2026-10-08': { quantidade: 99, valorCentavos: 10000 } } }, 'gestor', 403);
await check('A03 gestor nao remove sinal de historico', 'produtos/analytics-new?updateMask.fieldPaths=giroInicializado', 'PATCH', { giroInicializado: false }, 'gestor', 403);
console.log('Auditoria das regras concluída em projeto demo: 2 bloqueios básicos e regressoes de seguranca verificadas; gravacoes diretas e escalacao de privilegios bloqueadas.');
