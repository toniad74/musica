# ACCESO DESDE MÓVIL

## Problema
El móvil no puede acceder a `localhost:8000` porque "localhost" solo existe en el mismo ordenador.

## Solución 1: Acceder por IP Local (Rápido)

1. **Averigua la IP de tu PC** (en PowerShell ejecuta):
   ```powershell
   ipconfig
   ```
   Busca la línea que dice "Dirección IPv4" (será algo como `192.168.1.X`)

2. **Abre el servidor** con `INICIAR_SERVIDOR.bat`

3. **En tu móvil**, abre el navegador y ve a:
   ```
   http://TU_IP_LOCAL:8000
   ```
   Por ejemplo: `http://192.168.1.105:8000`

4. **IMPORTANTE**: Tu móvil y PC deben estar en la **misma red WiFi**

---

## Solución 2: Desplegar en GitHub Pages (Permanente)

Esta es la mejor opción para acceder desde cualquier dispositivo:

1. **Ve a tu repositorio en GitHub**:
   https://github.com/toniad74/musica

2. **Settings** → **Pages**

3. En "Source", selecciona:
   - Branch: **main**
   - Folder: **/ (root)**

4. Click en **Save**

5. Espera 2-3 minutos y tu app estará en:
   ```
   https://toniad74.github.io/musica/
   ```

6. **Guarda ese enlace** en marcadores de tu móvil

---

## ¿Cuál elegir?

- **Solución 1** → Para probar ahora mismo (solo funciona en tu WiFi)
- **Solución 2** → Para tener acceso permanente desde cualquier lugar

---

## Nota sobre CORS
Una vez desplegado en GitHub Pages, NO habrá problemas de CORS porque se sirve desde un dominio HTTPS real.
