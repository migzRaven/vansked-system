
import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";

// --------------------------------------------------
// FIREBASE CONFIGURATION
// --------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyBqwItUbPmUx5QvrsfSi0awflD1Sl__slY",
  authDomain: "vansked-system.firebaseapp.com",
  projectId: "vansked-system",
  storageBucket: "vansked-system.firebasestorage.app",
  messagingSenderId: "334317494284",
  appId: "1:334317494284:web:203dad87f15ac3d5fe8e29",
};

// --------------------------------------------------
// INITIALIZE FIREBASE
// --------------------------------------------------

const existingApp = getApps().find(
  (firebaseApp) => firebaseApp.name === "[DEFAULT]"
);

export const app =
  existingApp ?? initializeApp(firebaseConfig);

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

// Authentication continues using the real Firebase
// Authentication project during local testing.

export const auth = getAuth(app);

// --------------------------------------------------
// CLOUD FIRESTORE
// --------------------------------------------------

export const db = getFirestore(app);

// --------------------------------------------------
// LOCAL FIRESTORE EMULATOR
// --------------------------------------------------

const useFirestoreEmulator =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIRESTORE_EMULATOR === "true";

if (useFirestoreEmulator) {
  connectFirestoreEmulator(
    db,
    "127.0.0.1",
    8080
  );

  console.info(
    "VanSked: Connected to local Firestore Emulator."
  );
}
