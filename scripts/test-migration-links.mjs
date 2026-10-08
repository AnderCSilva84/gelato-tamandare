import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validarVinculoGerencia } from '../functions/migration-links.js';
const args = {
  cadastroId: 'manager-copy', cadastro: { role: 'gerencia', uid: 'store-b' },
  usuario: { uid: 'manager-auth' }, painel: { role: 'gerencia', lojaId: 'store-a', lojaIds: ['store-a', 'store-b'] },
  confirmacao: { atendenteId: 'manager-copy', authUid: 'manager-auth', role: 'gerencia', lojaIds: ['store-a', 'store-b'] },
};
assert.equal(validarVinculoGerencia(args), true);
assert.equal(validarVinculoGerencia({ ...args, confirmacao: undefined }), false);
assert.equal(validarVinculoGerencia({ ...args, usuario: { uid: 'another-auth' } }), false);
assert.equal(validarVinculoGerencia({ ...args, cadastroId: 'another-record' }), false);
assert.equal(validarVinculoGerencia({ ...args, cadastro: { role: 'gerencia', uid: 'store-c' } }), false);
assert.equal(validarVinculoGerencia({ ...args, painel: { ...args.painel, role: 'superadmin' } }), false);
assert.equal(validarVinculoGerencia({ ...args, confirmacao: { ...args.confirmacao, lojaIds: ['store-a', 'store-b', 'store-c'] } }), false);
mkdirSync('artifacts', { recursive: true });
const pendingFile = 'artifacts/vinculo-pendente-fixture.json';
writeFileSync(pendingFile, JSON.stringify({ projectId: 'demo-gelato-audit', autorizacaoIdentidadeConfirmada: false, vinculos: [args.confirmacao] }));
const blocked = spawnSync(process.execPath, ['scripts/migrar-credenciais.mjs', '--project', 'demo-gelato-audit', '--apply', '--vinculos-confirmados', pendingFile], { encoding: 'utf8', env: { ...process.env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8188', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9101' } });
assert.equal(blocked.status, 1);
assert.match(blocked.stderr, /Identidade da conta compartilhada ainda nao confirmada/);
console.log('Vinculo gerencia: exige confirmacao exata de cadastro, conta e escopo; recusa superadmin e outras lojas.');
