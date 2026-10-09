import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import { getCaixas } from './caixas';

const cache = new Map();
// Coalesce StrictMode/concurrent requests; partition by authenticated user and store.
export function getComparacaoPeriodo(uid, inicio, fim, atualizar = false) {
  const key = `${auth.currentUser?.uid}:${uid}:${inicio}:${fim}`;
  const existing = cache.get(key);
  if (existing && (existing.pending || !atualizar && Date.now() - existing.created < 60000)) return existing.promise;
  const entry = { created: Date.now(), pending: true };
  const promise = Promise.all([getDocs(query(collection(db, 'resumo_diario'), where('uid', '==', uid), where('data', '>=', inicio), where('data', '<=', fim))), getCaixas(uid, inicio, fim)])
    .then(([snapshot, registers]) => [snapshot.docs.filter(doc => doc.id === `${uid}__${doc.data().data}`).map(doc => ({ id: doc.id, ...doc.data() })), registers])
    .catch(error => { cache.delete(key); throw error; });
  entry.promise = promise.finally(() => { entry.pending = false; });
  cache.set(key, entry);
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  return entry.promise;
}
