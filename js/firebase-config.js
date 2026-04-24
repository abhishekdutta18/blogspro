// --------------------------------------------------
// BlogsPro: Firebase Configuration (V7.0)
// Project: blogspro-ai
// --------------------------------------------------

export const firebaseConfig = {
  apiKey: "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY",
  authDomain: "blogspro-ai.firebaseapp.com",
  projectId: "blogspro-ai",
  storageBucket: "blogspro-asset",
  messagingSenderId: "940428277283",
  appId: "1:940428277283:web:d3bb414f0992718ca76396",
  measurementId: "G-N7TCB31MRD"
};

// Export for usage in Admin Dashboard
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebaseConfig;
} else {
    window.FIREBASE_CONFIG = firebaseConfig;
}

export default firebaseConfig;
