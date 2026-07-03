@echo off
cd /d C:\eastclinic-autotests

echo [%date% %time%] Pulling latest tests from GitHub...
git pull

echo [%date% %time%] Running dev1 tests...
node run-and-capture.js dev

echo [%date% %time%] Done.
