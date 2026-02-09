# GUÍA DE INICIO RÁPIDO - AMAYA MUSIC

## PROBLEMA IDENTIFICADO

Tu navegador está bloqueando TODAS las conexiones porque estás abriendo `index.html` directamente (protocolo `file://`). Para que funcione, necesitas abrir la app desde un servidor local (protocolo `http://`).

---

## SOLUCIÓN 1: Servidor Local (RECOMENDADO)

### Opción A: Usando el Script Automático
1. **Haz doble clic** en `INICIAR_SERVIDOR.bat`
2. Se abrirá una ventana negra - **NO LA CIERRES**
3. Abre tu navegador y ve a: **http://localhost:8000**

### Opción B: Usando VS Code
1. Instala la extensión **"Live Server"**
2. Haz clic derecho en `index.html` → **"Open with Live Server"**

### Opción C: Manualmente con Python
```bash
# Abre PowerShell en la carpeta MUSICA y ejecuta:
python -m http.server 8000
```

---

## SOLUCIÓN 2: Configurar API Key de YouTube

Una vez el servidor esté funcionando, sigue estos pasos:

1. **Obtén una API Key gratuita**:
   - Ve a: https://console.cloud.google.com/apis/credentials
   - Crea un nuevo proyecto (si no tienes uno)
   - Haz clic en **"Crear credenciales" → "Clave de API"**
   - Copia la clave generada

2. **Configura la clave en la app**:
   - Abre la app en el navegador
   - Ve a **Configuración** (icono de engranaje)
   - Pega tu API key
   - Haz clic en **Guardar**

---

## VERIFICACIÓN

Después de iniciar el servidor y configurar la API key:

1. Abre http://localhost:8000
2. Presiona **F12** → pestaña "Console"
3. Busca "Rosalia"
4. Deberías ver mensajes `[DEEP-HUNT]` en la consola y resultados en pantalla

---

## ¿POR QUÉ NECESITO UN SERVIDOR LOCAL?

Los navegadores modernos **bloquean peticiones HTTP externas** cuando abres archivos HTML directamente (`file://`) por razones de seguridad (política CORS). Al usar un servidor local (`http://localhost`), el navegador permite estas conexiones.

---

## ALTERNATIVA: Usar la Versión Desplegada en GitHub Pages

Si prefieres no usar un servidor local, puedes desplegar la app en GitHub Pages:

1. Ve a tu repositorio en GitHub
2. **Settings** → **Pages**
3. Selecciona la rama **main** como fuente
4. Guarda y espera unos minutos
5. Tu app estará disponible en: `https://toniad74.github.io/musica/`

---

## CONTACTO

Si ninguna solución funciona, avísame y buscaremos otra alternativa.
