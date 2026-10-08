import assert from 'node:assert/strict';
import { montarTextoComprovante, quebrarTexto } from '../src/services/textoComprovante.js';

const texto = montarTextoComprovante({
  loja: { nome: 'Gelato Tamandaré', endereco: 'Rua com nome muito longo para verificar a quebra de linha do comprovante' },
  venda: {
    vendaGrupoId: 'venda-123', caixaId: 'caixa-1', atendenteNome: 'João', dataHora: '06/10/2026 10:00',
    itens: [{ nome: 'Sorvete de chocolate com descrição muito longa', quantidade: 0.125, unidadeVenda: 'kg', precoUnitario: 100, subtotal: 12.5 }],
    total: 12.5, pagamentos: [{ forma: 'Dinheiro', valor: 10 }, { forma: 'Pix', valor: 2.5 }], valorRecebido: 20, troco: 10,
  },
});
assert.ok(texto.split('\n').every((line) => line.length <= 32));
for (const esperado of ['Tamandaré', 'João', '0,125 kg', '12,50', 'Dinheiro:', 'Pix:', 'Troco:', 'venda-123']) assert.ok(texto.includes(esperado), esperado);
assert.ok(quebrarTexto('A'.repeat(100)).split('\n').every((line) => line.length <= 32));
const pix = montarTextoComprovante({ venda: { total: 10, formaPagamento: 'Pix' } });
assert.ok(!pix.includes('Troco:'));
console.log('Comprovante: largura, acentos, KG, pagamentos e troco verificados.');
