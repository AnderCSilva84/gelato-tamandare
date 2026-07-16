import { auth, secondaryAuth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
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
  await updatePassword(cred.user, novaSenha);
  await signOut(secondaryAuth);
}

export function registerAndLogin(email, senha) {
  return createUserWithEmailAndPassword(auth, email, senha);
}
