@echo off
cd /d C:\eastclinic-autotests

echo [%date% %time%] Pulling latest tests from GitHub...
git pull

echo [%date% %time%] Running prod tests...
set TEST_BASE_URL=https://eastclinic.ru
npx playwright test --retries=1 > results\__last-output.txt 2>&1

echo [%date% %time%] Saving results and log...
node -e "const {readFileSync,writeFileSync,existsSync}=require('fs');try{const text=existsSync('results/__last-output.txt')?readFileSync('results/__last-output.txt','utf8'):'';writeFileSync('results/last-log-prod.json',JSON.stringify({text,label:'все тесты (eastclinic.ru)'}));}catch(e){}try{const f=JSON.parse(readFileSync('results/last-run.json','utf8'));const p='results/all-results-prod.json';const e=existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null;if(!e||!e.suites){writeFileSync(p,JSON.stringify(f,null,2));}else{const ff=new Set(f.suites.map(s=>s.file));writeFileSync(p,JSON.stringify({...e,suites:[...e.suites.filter(s=>!ff.has(s.file)),...f.suites]},null,2));}}catch(e){};"

echo [%date% %time%] Done.
