import { auth, secondaryAuth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function login(email, senha) {
  return signInWithEmailAndPassword(auth, email, senha);
}

export function logout() {
  return signOut(auth);
}

export async function confirmarSenhaAtual(senha) {
  if (!auth.currentUser?.email) throw new Error('Entre novamente para confirmar sua identidade.');
  await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, senha));
  await auth.currentUser.getIdToken(true);
}

export async function confirmarSenhaAtendente(atendente, senha) {
  if (!atendente.authUid || !atendente.emailAcesso) throw new Error('O cadastro precisa ser migrado para Firebase Auth.');
  if (auth.currentUser?.uid === atendente.authUid) return confirmarSenhaAtual(senha);
  try {
    const cred = await signInWithEmailAndPassword(secondaryAuth, atendente.emailAcesso, senha);
    if (cred.user.uid !== atendente.authUid) throw new Error('Identidade do atendente invalida.');
  } finally {
    await signOut(secondaryAuth);
  }
}

export async function createPanelAuthUser(email, senha) {
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
  await signOut(secondaryAuth);
  return cred.user;
}

export async function ensurePanelAuthUser(email, senha) {
  try {
    return await createPanelAuthUser(email, senha);
  } catch (error) {
    if (error?.code !== "auth/email-already-in-use") throw error;
    const cred = await signInWithEmailAndPassword(secondaryAuth, email, senha);
    await signOut(secondaryAuth);
    return cred.user;
  }
}

export async function updatePanelAuthPassword(email, senhaAtual, novaSenha) {
  const cred = await signInWithEmailAndPassword(secondaryAuth, email, senhaAtual);
  try {
    await updatePassword(cred.user, novaSenha);
  } finally {
    await signOut(secondaryAuth);
  }
}

export function registerAndLogin(email, senha) {
  return createUserWithEmailAndPassword(auth, email, senha);
}
