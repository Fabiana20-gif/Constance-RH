import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
 
const firebaseConfig = {
  apiKey:            "AIzaSyCbbd16pLkSH7UPCE6z04-XHJLBz7i76dI",
  authDomain:        "constance-rh.firebaseapp.com",
  projectId:         "constance-rh",
  storageBucket:     "constance-rh.firebasestorage.app",
  messagingSenderId: "394071965825",
  appId:             "1:394071965825:web:540f99173a69ef53da8d80",
};
 
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
 
