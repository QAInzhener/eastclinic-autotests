@echo off
cd /d C:\eastclinic-autotests
echo Dashboard: http://localhost:3000
echo Press Ctrl+C to stop.
npx serve . -p 3000 -l
