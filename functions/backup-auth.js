import { createHash } from 'node:crypto';

export async function backupAuth({ projectId, accessToken, save, fetchApi = fetch, date = new Date() }) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new Error('Projeto invalido para backup.');
  const get = async url => {
    const result = await fetchApi(url, { headers: { Authorization: `Bearer ${accessToken}`, 'x-goog-user-project': projectId } });
    if (!result.ok) throw new Error(`Backup Auth: consulta retornou HTTP ${result.status}.`);
    return result.json();
  };
  const config = await get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?fields=signIn.hashConfig`);
  const hashConfig = config.signIn?.hashConfig;
  const users = [];
  let pageToken;
  const seen = new Set();
  do {
    const query = new URLSearchParams({ maxResults: '1000', ...(pageToken ? { nextPageToken: pageToken } : {}) });
    const page = await get(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?${query}`);
    users.push(...(page.users || []));
    pageToken = page.nextPageToken;
    if (pageToken) {
      if (seen.has(pageToken)) throw new Error('Paginacao do Auth repetiu uma pagina. Backup interrompido.');
      seen.add(pageToken);
    }
  } while (pageToken);
  const passwordUsers = users.filter(u => (u.providerUserInfo || []).some(p => p.providerId === 'password') || u.passwordHash);
  if (passwordUsers.some(u => !u.passwordHash) || (passwordUsers.length && (!hashConfig?.algorithm || !hashConfig?.signerKey))) throw new Error('Backup incompleto: faltam hashes ou parametros de restauracao de senha. Verifique permissoes de leitura do Auth.');
  const createdAt = date.toISOString();
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, projectId, createdAt, hashConfig, users }));
  const key = `auth/${createdAt.replace(/[:.]/g, '-')}.json`;
  await save(key, bytes);
  // Never return or log users, password hashes, signer key or access token.
  return { projectId, createdAt, object: key, users: users.length, passwordUsers: passwordUsers.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
