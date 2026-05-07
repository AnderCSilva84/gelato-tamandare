import { auth, secondaryAuth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
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

export function registerAndLogin(email, senha) {
  return createUserWithEmailAndPassword(auth, email, senha);
}
