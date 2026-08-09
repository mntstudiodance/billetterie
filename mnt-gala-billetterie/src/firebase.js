import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDzZrULv6_Xbat40QUI3azY_cL8KlTgI9I",
  authDomain: "billetterie-mnt.firebaseapp.com",
  projectId: "billetterie-mnt",
  storageBucket: "billetterie-mnt.firebasestorage.app",
  messagingSenderId: "308213552172",
  appId: "1:308213552172:web:f1f2b8f7eec3632c82ad89"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
