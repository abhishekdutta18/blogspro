import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getRemoteConfig } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-remote-config.js";


// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY",
  authDomain: "blogspro-ai.firebaseapp.com",
  projectId: "blogspro-ai",
  storageBucket: "blogspro-ai.firebasestorage.app",
  messagingSenderId: "940428277283",
  appId: "1:940428277283:web:d3bb414f0992718ca76396",
  measurementId: "G-N7TCB31MRD"
};


// Initialize Firebase
export const app = initializeApp(firebaseConfig);


// Firebase services
export const auth = getAuth(app);

export const db = getFirestore(app);

export const remoteConfig = getRemoteConfig(app);
