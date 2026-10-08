export function validarVinculoGerencia({ cadastroId, cadastro, usuario, painel, confirmacao }) {
  if (!confirmacao || confirmacao.atendenteId !== cadastroId || confirmacao.authUid !== usuario.uid
      || confirmacao.role !== 'gerencia' || cadastro.role !== 'gerencia' || painel?.role !== 'gerencia') return false;
  const expected = [...new Set(confirmacao.lojaIds || [])].sort();
  const existing = [...new Set([painel.lojaId, ...(painel.lojaIds || [])].filter(Boolean))].sort();
  return expected.length > 0 && expected.includes(cadastro.uid)
    && expected.every(id => typeof id === 'string' && id.length > 0)
    && expected.length === existing.length && expected.every((id, index) => id === existing[index]);
}
