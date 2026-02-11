---
description: Actualitza la versió de l'aplicació per forçar actualització automàtica
---

# ⚠️ IMPORTANT: Sempre que facis canvis a l'aplicació

Cada vegada que facis canvis al codi i vulguis que els usuaris rebin l'actualització automàtica, **HAS DE**:

## 1. Incrementar la versió del Service Worker Cache

**Fitxer**: `sw.js` (línies 1-2)

```javascript
const CACHE_NAME = 'amaya-music-vXX';  // ← Incrementa XX (exemple: v17 → v18)
// SW Version: 1.X.X - Time: HH:MM (GMT+1) - Descripció breu del canvi
```

**Exemple**:
```javascript
const CACHE_NAME = 'amaya-music-v18';
// SW Version: 1.5.1 - Time: 10:30 (GMT+1) - Correcció de bugs
```

## 2. Actualitzar la versió visible a la UI

**Fitxer**: `index.html`

Busca i actualitza **DOS llocs**:

### Desktop (línia ~145):
```html
<p class="text-white text-sm">v1.X.X</p>
<p class="text-white text-sm">DD mmm YYYY HH:MM</p>
```

### Mobile (línia ~255):
```html
<p class="text-white text-xs">v1.X.X</p>
<p class="text-white text-xs">DD mmm YYYY HH:MM</p>
```

## 3. Pujar els canvis a GitHub

```bash
git add .
git commit -m "vX.X.X - Descripció del canvi"
git push origin main
```

---

## 📋 Checklist ràpida

- [ ] Incrementar `CACHE_NAME` en `sw.js` (exemple: v17 → v18)
- [ ] Actualitzar comentari de versió en `sw.js`
- [ ] Actualitzar versió en dropdown Desktop (`index.html` ~línia 145)
- [ ] Actualitzar versió en dropdown Mobile (`index.html` ~línia 255)
- [ ] Actualitzar timestamp en ambdós dropdowns
- [ ] Fer commit i push a GitHub

---

## ❌ Què passa si NO incrementes la versió?

- Els usuaris **NO rebran l'actualització automàtica**
- Hauran de fer **Ctrl+F5** (hard refresh) manualment
- El Service Worker pensarà que no hi ha canvis

## ✅ Què passa si SÍ incrementes la versió?

- En **menys de 30 segons**, els usuaris veuran el toast d'actualització
- L'app es **recarregarà automàticament** amb la nova versió
- El cache antic s'**eliminarà automàticament**

---

## 🔢 Sistema de versionat recomanat

- **Major** (1.X.X): Canvis importants, noves funcionalitats grans
- **Minor** (X.5.X): Noves funcionalitats petites, millores
- **Patch** (X.X.1): Correccions de bugs, ajustos menors

**Exemple**:
- v1.4.8 → v1.5.0 (nova funcionalitat: login obligatori)
- v1.5.0 → v1.5.1 (correcció d'un bug)
- v1.5.1 → v2.0.0 (redisseny complet)
