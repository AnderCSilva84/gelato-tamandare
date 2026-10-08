import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { app, auth, usaEmuladores } from './firebase';

const functions = getFunctions(app, 'southamerica-east1');
if (usaEmuladores) connectFunctionsEmulator(functions, '127.0.0.1', 5002);
const execute = httpsCallable(functions, 'operacaoGelato', { timeout: 60000 });
const chave = (action, key) => `gelato-operacao:${auth.currentUser?.uid}:${action}:${key}`;
export function temOperacaoPendente(action, key) { return Boolean(window.localStorage.getItem(chave(action, key))); }
export async function recuperarOperacaoPendente(action, key) {
  return temOperacaoPendente(action, key) ? operacaoPersistente(action, key, {}) : null;
}
export async function executarOperacao(action, dados) {
  const result = await execute({ action, ...dados });
  return result.data;
}

// Persist the exact request before sending. An uncertain response must retry that
// request, including after reload, rather than create a second payment operation.
export async function operacaoPersistente(action, key, dados) {
  const storageKey = chave(action, key);
  const pending = window.localStorage.getItem(storageKey);
  const request = pending ? JSON.parse(pending) : { ...dados, operacaoId: crypto.randomUUID() };
  if (!pending) window.localStorage.setItem(storageKey, JSON.stringify(request));
  try {
    const result = await executarOperacao(action, request);
    window.localStorage.removeItem(storageKey);
    return { ...result, pedido: request, recuperada: Boolean(pending) };
  } catch (error) {
    // These codes explicitly reject before committing. Network/internal errors
    // keep the request pending so a retry can resolve its authoritative result.
    if (['invalid-argument', 'permission-denied', 'failed-precondition', 'not-found', 'unauthenticated', 'already-exists'].some(code => error.code === `functions/${code}`)) window.localStorage.removeItem(storageKey);
    throw error;
  }
}
