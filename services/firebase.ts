
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAxy9jNOipRylkqpd7r2tLTdIvsPtVAVlM",
  authDomain: "lingoliveai.firebaseapp.com",
  projectId: "lingoliveai",
  storageBucket: "lingoliveai.firebasestorage.app",
  messagingSenderId: "296154739850",
  appId: "1:296154739850:web:ed45fadbf04101da5a6973"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged };
export type { User };
