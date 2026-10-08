import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const usaEmuladores = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const config = usaEmuladores ? { projectId: 'demo-gelato-audit', apiKey: 'demo', appId: 'demo-gelato', authDomain: 'localhost', storageBucket: 'demo-gelato-audit.appspot.com' } : firebaseConfig;
export const app = initializeApp(config);
export const secondaryApp = initializeApp(config, "secondary");

export const db = getFirestore(app);
export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
export const storage = getStorage(app);
if (usaEmuladores) {
  connectFirestoreEmulator(db, '127.0.0.1', 8188);
  connectAuthEmulator(auth, 'http://127.0.0.1:9101', { disableWarnings: true });
  connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9101', { disableWarnings: true });
  connectStorageEmulator(storage, '127.0.0.1', 9299);
}
