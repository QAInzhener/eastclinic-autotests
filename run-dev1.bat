@echo off
cd /d C:\eastclinic-autotests

echo [%date% %time%] Pulling latest tests from GitHub...
git pull

echo [%date% %time%] Running dev1 tests...
set TEST_BASE_URL=http://dev1.eastclinic.local
npx playwright test --retries=1 2>&1

echo [%date% %time%] Merging results...
node -e "const {readFileSync,writeFileSync,existsSync}=require('fs');function merge(p){const f=JSON.parse(readFileSync('results/last-run.json','utf8'));const e=existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null;if(!e||!e.suites){writeFileSync(p,JSON.stringify(f,null,2));return;}const ff=new Set(f.suites.map(s=>s.file));writeFileSync(p,JSON.stringify({...e,suites:[...e.suites.filter(s=>!ff.has(s.file)),...f.suites]},null,2));}merge('results/all-results-dev.json');"

echo [%date% %time%] Done.
