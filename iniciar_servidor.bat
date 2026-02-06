@echo off
echo ==========================================
echo   Amaya's Music - Iniciador de Servidor
echo ==========================================
echo.
echo Intentando iniciar servidor...
echo.

:: Intento 1: Python normal
python -m http.server 8000
if %errorlevel% equ 0 goto :success

:: Intento 2: Python Launcher (py)
py -m http.server 8000
if %errorlevel% equ 0 goto :success

:: Intento 3: Node.js (npx)
npx -y serve ./
if %errorlevel% equ 0 goto :success

echo.
echo [ERROR] No se encontro ni Python ni Node.js.
echo.
echo Opciones:
echo 1. Instala Python desde: https://www.python.org/
echo 2. Instala Node.js desde: https://nodejs.org/
echo 3. Usa la extension 'Live Server' en VS Code.
echo 4. Sube la carpeta MUSICA a https://app.netlify.com/drop (Solo arrastrar y soltar)
echo.
pause
exit

:success
echo Servidor cerrado.
pause
