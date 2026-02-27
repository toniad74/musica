import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBHCTj7Jhlklf2ZL7AcE6ggkOvdgP9eotY",
    authDomain: "musica-amaya.firebaseapp.com",
    projectId: "musica-amaya",
    storageBucket: "musica-amaya.firebasestorage.app",
    messagingSenderId: "754394913699",
    appId: "1:754394913699:web:f2f0c8f8f0ee30de65d816",
    measurementId: "G-077C93FT2T"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
