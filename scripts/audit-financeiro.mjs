import assert from 'node:assert/strict';
import { calcularResumoFinanceiro, somarValores } from '../src/utils/financeiro.js';
assert.equal(somarValores([{valor:0.1},{valor:0.2}]),0.3);
const resumo = calcularResumoFinanceiro({ vendas:[{valor:100,formaPagamento:'PIX',custoTotal:20}], caixas:[{fundoCaixa:10}], retiradas:[{valor:5}], despesas:[{valor:7}] });
assert.equal(resumo.dinheiroEmCaixa,5);
assert.equal(resumo.resultado,93);
assert.equal(resumo.margemVendasConhecida,80);
assert.equal(resumo.vendasSemCustoHistorico,0);
console.log('Financeiro: centavos, dinheiro fisico separado do PIX, sangria sem despesa e custo historico verificados.');
