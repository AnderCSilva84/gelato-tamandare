const WIDTH = 32;
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function quebrarTexto(value, width = WIDTH) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').split(/\s+/).reduce((lines, word) => {
    while (word.length > width) {
      if (lines.at(-1)) lines.push('');
      lines[lines.length - 1] = word.slice(0, width);
      lines.push('');
      word = word.slice(width);
    }
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 > width) lines.push(word);
    else lines[lines.length - 1] = last ? `${last} ${word}` : word;
    return lines;
  }, ['']).join('\n');
}

export function montarTextoComprovante({ loja, venda }) {
  const pagamentos = venda.pagamentos?.length ? venda.pagamentos : [{ forma: venda.formaPagamento, valor: venda.total }];
  const lines = [loja?.nome || 'Gelato Tamandare', loja?.documento, loja?.endereco,
    '-'.repeat(WIDTH), 'COMPROVANTE NAO FISCAL', venda.dataHora,
    `Venda: ${venda.vendaGrupoId || ''}`, `Atendente: ${venda.atendenteNome || ''}`, `Caixa: ${venda.caixaId || ''}`, '-'.repeat(WIDTH)];
  for (const item of venda.itens || []) {
    const quantidade = Number(item.quantidade || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    lines.push(item.nome, `${quantidade} ${item.unidadeVenda === 'kg' ? 'kg' : 'un'} x ${money(item.precoUnitario)}`, `Subtotal: ${money(item.subtotal)}`);
  }
  lines.push('-'.repeat(WIDTH), `TOTAL: ${money(venda.total)}`, 'Pagamento(s)');
  for (const item of pagamentos) lines.push(`${item.forma || ''}: ${money(item.valor)}`);
  if (pagamentos.some((item) => item.forma === 'Dinheiro')) lines.push(`Recebido: ${money(venda.valorRecebido)}`, `Troco: ${money(venda.troco)}`);
  lines.push('-'.repeat(WIDTH), 'Obrigado pela preferencia!');
  return lines.filter((line) => line !== undefined && line !== null && line !== '').map((line) => quebrarTexto(line)).join('\n');
}
