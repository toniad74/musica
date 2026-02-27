import { auth, db } from './firebase-config.js';
import {
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    addDoc,
    collection
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { state } from './state.js';
import { ui } from './ui-module.js';

const googleProvider = new GoogleAuthProvider();

export async function loginWithGoogle() {
    console.log("👉 loginWithGoogle called from button");
    try {
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.error("Error signing in with Google:", error);
        ui.showToast("No se pudo iniciar sesión con Google", "error");
    }
}

export async function logout() {
    try {
        await signOut(auth);
        window.location.reload();
    } catch (error) {
        console.error("Error signing out:", error);
        ui.showToast("Error al cerrar sesión", "error");
    }
}

export function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.currentUserUid = user.uid;

            try {
                // Fetch info
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);

                let userData = null;
                if (userSnap.exists()) {
                    userData = userSnap.data();
                    // Sync missing metadata
                    if (!userData.email || !userData.displayName) {
                        try {
                            await updateDoc(userRef, {
                                email: user.email,
                                displayName: user.displayName,
                                name: user.displayName,
                                photoURL: user.photoURL
                            });
                            userData.email = user.email;
                            userData.displayName = user.displayName;
                            userData.name = user.displayName;
                            userData.photoURL = user.photoURL;
                        } catch (e) {
                            console.warn("Could not sync user metadata:", e);
                        }
                    }
                } else {
                    // Create basic doc
                    userData = {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName,
                        name: user.displayName,
                        photoURL: user.photoURL,
                        createdAt: serverTimestamp(),
                        isBlocked: false,
                        expiryDate: null,
                        isAdmin: false,
                        playlists: []
                    };
                    await setDoc(userRef, userData);
                }

                // Check account status
                const now = new Date();
                const isExpired = userData.expiryDate && userData.expiryDate.toDate() < now;

                if (userData.isBlocked || isExpired) {
                    const reason = userData.isBlocked ?
                        "Tu cuenta ha sido bloqueada. Por favor, contacta con el administrador." :
                        "Tu suscripción ha caducado. Por favor, contacta con el administrador.";

                    ui.showToast(reason, "error", 10000);

                    // Show error in login overlay
                    const loginOverlay = document.getElementById('loginOverlay');
                    if (loginOverlay) {
                        loginOverlay.classList.remove('hidden', 'opacity-0');
                        loginOverlay.classList.add('flex');
                        const loginInstructions = document.getElementById('loginInstructions');
                        if (loginInstructions) {
                            loginInstructions.innerHTML = `<span class="text-red-500 font-black animate-pulse bg-red-500/10 p-4 rounded-2xl block border border-red-500/20">${reason}</span>`;
                        }
                    }

                    await signOut(auth);
                    return;
                }

                // UI setup with logged in user
                ui.renderLoggedInUI(user, userData);

                // Notification logic for expiry (Point 5)
                checkExpiryNotifications(userData);

                // Global events for the admin point (Point 5)
                logActivity("login", userData);

            } catch (error) {
                console.error("Error in auth listener:", error);
                ui.showToast("Error al verificar el estado de la cuenta", "error");
            }
        } else {
            state.currentUserUid = null;
            ui.renderLoggedOutUI();
        }
    });
}

// Point 5 features (Admin & Notifications) 
async function logActivity(type, userData) {
    if (userData.isAdmin) return; // Don't log admin activity
    try {
        await addDoc(collection(db, "global_logs"), {
            type,
            userId: userData.uid,
            userName: userData.displayName,
            userEmail: userData.email,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.warn("Could not log activity:", e);
    }
}

function checkExpiryNotifications(userData) {
    if (!userData.expiryDate) return;
    const expiryDate = userData.expiryDate.toDate();
    const now = new Date();
    const diffTime = Math.abs(expiryDate - now);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 3 && expiryDate > now) {
        ui.showToast(`⚠️ Tu suscripción caducará en ${diffDays} día(s).`, "warning", 8000);
    }
}
