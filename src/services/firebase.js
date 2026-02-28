import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDMiM09VSJlA5utB7dAOqfsnJingjax760",
  authDomain: "banco-do-porto.firebaseapp.com",
  projectId: "banco-do-porto",
  storageBucket: "banco-do-porto.firebasestorage.app",
  messagingSenderId: "289636218113",
  appId: "1:289636218113:web:5fe6f0c597dda2183fd700"
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);