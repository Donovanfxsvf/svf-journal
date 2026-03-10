import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDZpZRhKePSNobLsouDZP8s_j66pPpEpqE",
  authDomain: "svf-journal.firebaseapp.com",
  projectId: "svf-journal",
  storageBucket: "svf-journal.firebasestorage.app",
  messagingSenderId: "1052769389659",
  appId: "1:1052769389659:web:ca24cdbac7a2df9d6e037e"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
