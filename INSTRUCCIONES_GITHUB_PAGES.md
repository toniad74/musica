# INSTRUCCIONES PARA ACTIVAR GITHUB PAGES

## Pasos para activar el despliegue:

### 1. Ve a tu repositorio en GitHub
Abre: https://github.com/toniad74/musica

### 2. Accede a la configuración
- Haz clic en **"Settings"** (Configuración) en la barra superior del repositorio

### 3. Encuentra la sección Pages
- En el menú lateral izquierdo, busca y haz clic en **"Pages"**

### 4. Configura la fuente
- En **"Source"** (Fuente), selecciona:
  - Branch: **main**
  - Folder: **/ (root)**
- Haz clic en **"Save"** (Guardar)

### 5. Espera el despliegue
- GitHub mostrará un mensaje: "Your site is ready to be published at..."
- Espera 1-3 minutos para que se complete el despliegue
- La página se actualizará mostrando: "Your site is live at..."

### 6. Accede a tu aplicación
Tu app estará disponible en:
**https://toniad74.github.io/musica/**

### 7. Prueba la búsqueda
- Abre la URL de GitHub Pages
- Busca "Rosalia" o cualquier artista
- **IMPORTANTE**: Abre la consola del navegador (F12) y verifica si ahora funciona sin errores CORS

---

## Si sigue sin funcionar

Si después de desplegar en GitHub Pages sigues viendo errores "Failed to fetch", significa que incluso con HTTPS los servidores Invidious bloquean CORS.

En ese caso, la única solución viable es:
1. Usar YouTube IFrame API (configurar una API key gratuita)
2. O implementar un backend propio que haga de proxy

---

## Actualizaciones futuras

Cada vez que hagas cambios en tu código local:
1. `git add -A`
2. `git commit -m "Descripción del cambio"`
3. `git push origin main`

GitHub Pages se actualizará automáticamente en 1-2 minutos.
