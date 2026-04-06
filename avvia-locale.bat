@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Errore: npm non trovato. Installa Node.js e riprova.
  pause
  exit /b 1
)

echo Avvio applicazione in locale...
echo URL: http://localhost:3000
start "" http://localhost:3000

npm run dev
