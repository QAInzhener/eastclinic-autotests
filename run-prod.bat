@echo off
cd /d C:\eastclinic-autotests

echo [%date% %time%] Pulling latest tests from GitHub...
git pull

echo [%date% %time%] Running prod tests...
node run-and-capture.js prod

echo [%date% %time%] Done.
