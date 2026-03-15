import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY",
  authDomain: "blogspro-ai.firebaseapp.com",
  projectId: "blogspro-ai",
  storageBucket: "blogspro-ai.firebasestorage.app",
  messagingSenderId: "940428277283",
  appId: "1:940428277283:web:d3bb414f0992718ca76396",
  measurementId: "G-N7TCB31MRD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
