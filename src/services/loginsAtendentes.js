function normalizeLogin(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildAtendenteEmail(lojaId, nome) {
  return `atendente.${normalizeLogin(lojaId)}.${normalizeLogin(nome)}@acs.local`;
}
