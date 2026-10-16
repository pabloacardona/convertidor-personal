@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
start "" http://localhost:3210
node src\server.js
