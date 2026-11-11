// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBqwItUbPmUx5QvrsfSi0awflD1Sl__slY",
  authDomain: "vansked-system.firebaseapp.com",
  projectId: "vansked-system",
  storageBucket: "vansked-system.firebasestorage.app",
  messagingSenderId: "334317494284",
  appId: "1:334317494284:web:203dad87f15ac3d5fe8e29"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and EXPORT IT
export const db = getFirestore(app);