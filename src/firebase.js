import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyAbY8LIZ8J6WZdGkKrFmQPIxXdxI_YgiHU",
    authDomain: "fnbv2-8998e.firebaseapp.com",
    projectId: "fnbv2-8998e",
    storageBucket: "fnbv2-8998e.firebasestorage.app",
    messagingSenderId: "724931743793",
    appId: "1:724931743793:web:e94831028b91893a628510"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services so we can use them in our pages
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;