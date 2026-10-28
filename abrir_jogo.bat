@echo off
cd /d "%~dp0"
set "PORTA=8000"

where python >nul 2>&1
if errorlevel 1 (
    echo Python nao foi encontrado no PATH.
    pause
    exit /b 1
)

start "Starfall 3D - servidor" cmd /k "cd /d ""%~dp0"" && python -m http.server %PORTA%"
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORTA%/index.html"
