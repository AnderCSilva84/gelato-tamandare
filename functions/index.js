import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { createOperations } from './operations.js';

initializeApp();
const operations = createOperations({ db: getFirestore(), auth: getAuth(), FieldValue, HttpsError });
export const operacaoGelato = onCall({ region: 'southamerica-east1', maxInstances: 10, timeoutSeconds: 60 }, async request => {
  // Never log the payload: user provisioning includes a password.
  const context = { action: String(request.data?.action || '').slice(0, 40), autorUid: request.auth?.uid || null };
  try {
    if (request.auth) {
      const bearer = request.rawRequest.headers.authorization?.replace(/^Bearer /, '');
      try { await getAuth().verifyIdToken(bearer, true); }
      catch { throw new HttpsError('unauthenticated', 'Sessao revogada. Entre novamente.'); }
    }
    const result = await operations(request);
    logger.info('operacaoConcluida', context);
    return result;
  } catch (error) {
    logger.warn('operacaoRejeitada', { ...context, codigo: error.code || 'internal' });
    throw error;
  }
});
