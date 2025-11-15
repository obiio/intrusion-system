// firebase.js - Firebase Initialization
const firebaseConfig = {
  apiKey: "AIzaSyD7hq9-fr30lS94i9ck6S6bksEOB0lY0UY",
  authDomain: "intrustion.firebaseapp.com",
  projectId: "intrustion",
  storageBucket: "intrustion.firebasestorage.app",
  messagingSenderId: "617836953682",
  appId: "1:617836953682:web:1a3c5f363790adb2c61f8b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Export for use in other files
window.db = db;
window.auth = auth;