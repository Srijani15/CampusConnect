import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported as isMessagingSupported } from "firebase/messaging";

export const ALLOWED_DOMAIN = "bvrithyderabad.edu.in";

const firebaseConfig = {
  apiKey: "AIzaSyA1mirE2AJWx5k58gCiauZ05VHf5aPg_7I",
  authDomain: "campusconnect-55cca.firebaseapp.com",
  projectId: "campusconnect-55cca",
  storageBucket: "campusconnect-55cca.firebasestorage.app",
  messagingSenderId: "882891881661",
  appId: "1:882891881661:web:f1610cd134db1c50c54bd4",
  measurementId: "G-97V72RBMDB",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  hd: ALLOWED_DOMAIN,
  prompt: "select_account",
});

export function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

export async function getMessagingIfSupported() {
  const supported = await isMessagingSupported();
  if (!supported) return null;
  return getMessaging(app);
}
