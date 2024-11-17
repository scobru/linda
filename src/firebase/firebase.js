import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  // Le tue configurazioni di Firebase qui
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); 