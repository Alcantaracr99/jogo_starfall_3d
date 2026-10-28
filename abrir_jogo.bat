@echo off
cd /d "%~dp0"
start "" http://localhost:8000/starfall_3D.html
python -m http.server 8000
