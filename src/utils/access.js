export function normalizeRole(role) {
  if (role === "superadmin") return "superadmin";
  if (role === "gerencia") return "gerencia";
  return "atendente";
}

export function isManagementRole(role) {
  const normalized = normalizeRole(role);
  return normalized === "gerencia" || normalized === "superadmin";
}

export function isSuperAdminRole(role) {
  return normalizeRole(role) === "superadmin";
}

export function getRoleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === "superadmin") return "Superadmin";
  if (normalized === "gerencia") return "Gerencia";
  return "Atendente";
}
