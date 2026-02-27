import { state } from './state.js';
import { ui } from './ui-module.js';
import { db } from './firebase-config.js';
import {
    collection,
    getDocs,
    query,
    orderBy,
    limit,
    where,
    doc,
    updateDoc,
    getDoc,
    serverTimestamp,
    addDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const adminManager = {
    async loadUserList() {
        if (!state.currentUserUid) return;
        const container = document.getElementById('userListContainer');
        if (!container) return;

        container.innerHTML = '<div class="p-8 text-center text-gray-500 animate-pulse">Cargando usuarios...</div>';

        try {
            const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(100));
            const querySnapshot = await getDocs(q);

            container.innerHTML = '';
            querySnapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const id = docSnap.id;
                this.renderUserRow(container, id, user);
            });

            this.loadGlobalStats();

        } catch (error) {
            console.error("Error loading user list:", error);
            ui.showToast("Error al cargar usuarios", "error");
        }
    },

    renderUserRow(container, id, user) {
        const isBlocked = user.isBlocked || false;
        const expiryDate = user.expiryDate && typeof user.expiryDate.toDate === 'function' ? user.expiryDate.toDate() : (user.expiryDate ? new Date(user.expiryDate) : null);
        const expiryStr = expiryDate ? expiryDate.toLocaleDateString() : 'Sin caducidad';
        const isExpired = expiryDate && expiryDate < new Date();
        const userName = user.displayName || user.name || (user.email ? user.email.split('@')[0] : null) || `ID: ..${id.slice(-6)}`;

        const userRow = document.createElement('div');
        userRow.className = 'p-4 border-b border-white/5 hover:bg-white/5 transition-all group relative';

        const adminGlow = user.isAdmin ? 'ring-2 ring-yellow-500 shadow-[0_0_15px_rgba(255,215,0,0.3)]' : 'border border-white/10';

        userRow.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-4 flex-1 min-w-0">
                    <div class="relative">
                        <img src="${user.photoURL || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}" 
                             class="w-12 h-12 rounded-full object-cover ${adminGlow}">
                        ${user.isAdmin ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center text-[8px] font-black text-black">A</div>' : ''}
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-white font-bold truncate flex items-center gap-2">
                            ${userName}
                            ${isBlocked ? '<span class="text-[10px] bg-red-500 text-white px-1.5 rounded uppercase font-black tracking-tighter">BLOQUEADO</span>' : ''}
                        </h4>
                        <p class="text-[10px] text-gray-500 truncate font-mono">${user.email || id}</p>
                    </div>
                </div>

                <div class="flex items-center gap-6">
                    <div class="text-right">
                        <p class="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Caducidad</p>
                        <p class="text-sm ${isExpired ? 'text-red-500 font-black animate-pulse' : (expiryDate ? 'text-green-400 font-bold' : 'text-gray-400 font-medium')}">
                            ${expiryStr}
                        </p>
                    </div>

                    <div class="relative">
                        <button onclick="adminManager.toggleUserMenu('${id}')" 
                                class="p-2 hover:bg-white/10 rounded-full text-gray-400 transition-all hover:text-white border border-white/5">
                            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                            </svg>
                        </button>
                        
                        <!-- Dropdown Menu -->
                        <div id="userMenu-${id}" class="hidden absolute right-0 top-full mt-2 w-56 bg-[#282828] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                            <div class="p-2 space-y-1">
                                <label class="block px-3 py-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Cambiar Caducidad</label>
                                <input type="date" value="${expiryDate ? expiryDate.toISOString().split('T')[0] : ''}" 
                                       onchange="adminManager.updateUserExpiry('${id}', this.value)"
                                       class="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-green-500 mb-2">
                                
                                <button onclick="adminManager.updateUserExpiry('${id}', null)" 
                                        class="w-full text-left px-4 py-2 text-xs text-yellow-400 hover:bg-white/5 flex items-center gap-2 transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    Eliminar Caducidad
                                </button>
                                
                                <div class="h-px bg-white/5 my-1"></div>
                                
                                <button onclick="adminManager.toggleBlockUser('${id}', ${!isBlocked})" 
                                        class="w-full text-left px-4 py-2 text-xs ${isBlocked ? 'text-green-500' : 'text-red-500'} hover:bg-white/5 flex items-center gap-2 transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                                    ${isBlocked ? 'Desbloquear Cuenta' : 'Bloquear Cuenta'}
                                </button>

                                <button onclick="adminManager.toggleAdmin('${id}', ${!user.isAdmin})" 
                                        class="w-full text-left px-4 py-2 text-xs ${user.isAdmin ? 'text-gray-400' : 'text-yellow-500'} hover:bg-white/5 flex items-center gap-2 transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                                    ${user.isAdmin ? 'Quitar Admin' : 'Hacer Admin'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(userRow);
    },

    toggleUserMenu(uid) {
        const menu = document.getElementById(`userMenu-${uid}`);
        if (!menu) return;

        // Close other menus
        document.querySelectorAll('[id^="userMenu-"]').forEach(m => {
            if (m.id !== `userMenu-${uid}`) m.classList.add('hidden');
        });

        menu.classList.toggle('hidden');
    },

    async updateUserExpiry(uid, dateStr) {
        try {
            const expiryDate = dateStr ? new Date(dateStr) : null;
            await updateDoc(doc(db, "users", uid), {
                expiryDate: expiryDate
            });
            ui.showToast(dateStr ? "Fecha actualizada" : "Caducidad eliminada", "success");
            this.loadUserList();
        } catch (e) {
            ui.showToast("Error al actualizar", "error");
        }
    },

    async toggleBlockUser(uid, shouldBlock) {
        try {
            await updateDoc(doc(db, "users", uid), {
                isBlocked: shouldBlock
            });
            ui.showToast(shouldBlock ? "Usuario bloqueado" : "Usuario desbloqueado", shouldBlock ? "warning" : "success");
            this.loadUserList();
        } catch (e) {
            ui.showToast("Error al bloquear", "error");
        }
    },

    async toggleAdmin(uid, makeAdmin) {
        try {
            await updateDoc(doc(db, "users", uid), {
                isAdmin: makeAdmin
            });
            ui.showToast(makeAdmin ? "Admin nombrado" : "Admin revocado", "info");
            this.loadUserList();
        } catch (e) {
            ui.showToast("Error de permisos", "error");
        }
    },

    async loadGlobalStats() {
        const logsContainer = document.getElementById('globalLogsContainer');
        if (!logsContainer) return;

        try {
            const q = query(collection(db, "global_logs"), orderBy("timestamp", "desc"), limit(20));
            const logsSnap = await getDocs(q);

            logsContainer.innerHTML = '';
            const scrollContainer = document.createElement('div');
            scrollContainer.className = 'max-h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-2';

            if (logsSnap.empty) {
                logsContainer.innerHTML = '<p class="p-8 text-center text-gray-600 italic">No hay actividad reciente</p>';
                return;
            }

            logsSnap.forEach(docSnap => {
                const log = docSnap.data();
                const time = log.timestamp ? log.timestamp.toDate().toLocaleTimeString() : '--:--';
                const date = log.timestamp ? log.timestamp.toDate().toLocaleDateString() : '';

                const logItem = document.createElement('div');
                logItem.className = 'text-[11px] p-2 bg-white/5 border border-white/5 rounded-lg flex justify-between items-center group hover:border-green-500/30 transition-all';
                logItem.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-1.5 h-1.5 rounded-full ${log.type === 'login' ? 'bg-green-500' : 'bg-blue-500'} animate-pulse"></div>
                        <div>
                            <span class="text-white font-bold">${log.userName || 'Usuario'}</span>
                            <span class="text-gray-500 ml-1">inició sesión</span>
                        </div>
                    </div>
                    <div class="text-right flex flex-col items-end">
                        <span class="text-green-500 font-mono font-black">${time}</span>
                        <span class="text-[9px] text-gray-600">${date}</span>
                    </div>
                `;
                scrollContainer.appendChild(logItem);
            });
            logsContainer.appendChild(scrollContainer);
        } catch (e) {
            console.warn("Global logs error:", e);
        }
    }
};

window.adminManager = adminManager;
