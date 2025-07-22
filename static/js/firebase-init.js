// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBDwRBgPP8sRzBlAy56mKkC-zQcWZSnrYE",
  authDomain: "study-buddy-3ac65.firebaseapp.com",
  projectId: "study-buddy-3ac65",
  storageBucket: "study-buddy-3ac65.firebasestorage.app",
  messagingSenderId: "530278431475",
  appId: "1:530278431475:web:a73c497c53e0c4c7799586",
  measurementId: "G-DLK65HJM40"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Get a reference to the Firebase authentication service and Firestore database
const auth = firebase.auth();
const db = firebase.firestore();
