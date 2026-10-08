import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { buildAtendenteEmail } from '../src/utils/loginAtendente.js';

let scenario = 'missing';
const calls = [];
const firestore = new SyntheticModule(['doc', 'getDoc'], function () {
  this.setExport('doc', (_, collection, id) => { calls.push({ collection, id }); return id; });
  this.setExport('getDoc', async () => {
    if (scenario === 'denied') throw Object.assign(new Error('Negado'), { code: 'permission-denied' });
    if (scenario === 'offline') throw Object.assign(new Error('Sem rede'), { code: 'unavailable' });
    return { exists: () => scenario === 'renamed', data: () => ({ email: 'atendente.loja.nome-anterior@acs.local' }) };
  });
});
const db = new SyntheticModule(['db'], function () { this.setExport('db', {}); });
const utils = new SyntheticModule(['buildAtendenteEmail'], function () { this.setExport('buildAtendenteEmail', buildAtendenteEmail); });
const module = new SourceTextModule(await readFile(new URL('../src/services/loginsAtendentes.js', import.meta.url), 'utf8'));
await module.link(specifier => specifier === 'firebase/firestore' ? firestore : specifier === './firebase' ? db : utils);
await module.evaluate();
const resolve = module.namespace.resolverEmailAtendente;
const expected = 'atendente.loja-a.leticia-teste@acs.local';
assert.equal(await resolve('loja-a', 'Letícia Teste'), expected);
scenario = 'denied';
assert.equal(await resolve('loja-a', 'Letícia Teste'), expected);
scenario = 'renamed';
assert.equal(await resolve('loja-a', 'Letícia Teste'), 'atendente.loja.nome-anterior@acs.local');
scenario = 'offline';
await assert.rejects(resolve('loja-a', 'Letícia Teste'), error => error.code === 'unavailable');
assert.ok(calls.every(call => call.collection === 'logins_atendentes'));
console.log('Login por nome: regras legadas, alias ausente, nome alterado e falha de rede conferidos; nenhuma escrita ou autenticacao realizada pelo resolvedor.');
