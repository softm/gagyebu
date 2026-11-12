import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Cloudflare cutover only when encrypted D1 ledger is ready',()=>{
 const bridge=source('src/web-account.js');
 assert.match(bridge,/health\.features\?\.gagyebuLedger===true/);
 assert.match(bridge,/web-account-cloudflare\.js/);
 assert.match(bridge,/web-account-legacy\.js/);
 assert.match(bridge,/catch\{/);
});
test('legacy server ledger is retained as fallback',()=>{
 const legacy=source('src/web-account-legacy.js');
 assert.match(legacy,/suiteAuth\/gagyebu\/ledger/);
 assert.match(legacy,/mountWebAccount/);
});
test('Cloudflare site bridge is scoped to gagyebu and has no direct Firebase writes',()=>{
 const sourceText=source('src/web-account-cloudflare.js');
 assert.match(sourceText,/siteId:'gagyebu'/);
 assert.match(sourceText,/softm-hannun-account\.softm\.workers\.dev/);
 assert.match(sourceText,/exchangeLedger/);
 assert.doesNotMatch(sourceText,/getFirestore|httpsCallable|initializeApp\(firebaseConfig/);
});
test('local guest ledger and Android private candidates remain excluded from synced data',()=>{
 const ledger=source('src/account-ledger.js');
 const database=source('src/db.js');
 assert.match(ledger,/loadState\(null\)/);
 assert.match(ledger,/pending.*android-/);
 assert.match(ledger,/sourceText/);
 assert.match(ledger,/attachmentPath/);
 assert.match(database,/suiteKey=uid=>uid\?'suite-ledger:'/);
 assert.match(database,/:'main'/);
});
test('Cloudflare deletion controls are disabled; native Android assets remain separate',()=>{
 const app=source('src/app.js');
 assert.match(app,/suiteAccount\?\.backend!=='cloudflare'/);
 assert.match(source('src/web-account.js'),/Cloudflare 보관소 삭제 기능은 아직 지원되지 않습니다/);
});
