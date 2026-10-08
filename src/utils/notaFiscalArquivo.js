export const TIPOS_NOTA_FISCAL = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function validarNotaFiscal(file) {
  if (!file || !TIPOS_NOTA_FISCAL[file.type]) throw new Error('Selecione uma nota em PDF, JPG, PNG ou WebP.');
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('A nota deve ter conteúdo e no máximo 10 MB.');
}
