@echo off
echo ========================================
echo  SERVIDOR LOCAL - AMAYA MUSIC
echo ========================================
echo.
echo Iniciando servidor en http://localhost:8000
echo.
echo IMPORTANTE: NO CIERRES ESTA VENTANA
echo Para detener el servidor, presiona Ctrl+C
echo.
echo Una vez iniciado, abre tu navegador en:
echo http://localhost:8000
echo.
echo ========================================
echo.

cd /d "%~dp0"
python -m http.server 8000 2>nul || (
    echo ERROR: Python no esta instalado o no esta en PATH
    echo.
    echo Intentando con PHP...
    php -S localhost:8000 2>nul || (
        echo ERROR: Ni Python ni PHP estan disponibles
        echo.
        echo SOLUCION: Instala Python desde python.org
        echo O usa Live Server en VS Code
        pause
        exit /b 1
    )
)
