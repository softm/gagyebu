import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Cloudflare cutover only when encrypted D1 ledger is ready',()=>{
 const bridge=source('src/web-account.js');
 assert.match(bridge,/health\.features\?\.gagyebuLedger!==true/);
 assert.match(bridge,/web-account-cloudflare\.js/);
 assert.doesNotMatch(bridge,/web-account-legacy\.js/);
 assert.match(bridge,/catch\{/);
});
test('PC runtime has no Firebase SDK import or legacy account fallback',()=>{
 const bridge=source('src/web-account.js');
 const service=source('src/cloud.js');
 assert.doesNotMatch(bridge,/web-account-legacy\.js/);
 assert.doesNotMatch(service,/gstatic\.com|firebase-app\.js|firebase-firestore\.js/);
 assert.match(service,/Cloudflare-only/);
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
test('signed-out view selects Google Kakao Naver; signed-in view omits SNS picker',()=>{
  const ui=source('src/web-account-cloudflare.js');
  assert.match(ui,/\[\['google','Google'\],\['kakao','카카오'\],\['naver','네이버'\]\]/);
  assert.match(ui,/const next=await account\.login\(id\)/);
  assert.match(ui,/if\(user\)\{/);
  assert.match(ui,/providerStatus\[id\]/);
  assert.match(ui,/연결 준비 중/);
  assert.match(ui,/승인 대기/);
  assert.match(ui,/client\.currentUser\?\.provider/);
  const bridge=source('src/web-account.js');
  assert.match(bridge,/features\?\.gagyebuLedger!==true/);
});
test('Cloudflare deletion controls are disabled; native Android assets remain separate',()=>{
 const app=source('src/app.js');
 assert.match(app,/suiteAccount\?\.backend!=='cloudflare'/);
 assert.match(source('src/web-account.js'),/Cloudflare 보관소 삭제는 데이터 이전 검증/);
});

test('transient Cloudflare outage never silently signs in to legacy Firebase',()=>{
 const bridge=source('src/web-account.js');
 assert.match(bridge,/if\(!response\.ok\)throw Error/);
 assert.match(bridge,/throw Error\('Cloudflare 계정 서버에 연결하지 못했습니다/);
 assert.match(bridge,/health\.features\?\.gagyebuLedger!==true/);
 assert.match(bridge,/loading=null/);
});

test('header triggers are fixed-size: logged-out user icon and logged-in avatar without name',()=>{
 const ui=source('src/web-account-cloudflare.js');
 assert.match(ui,/for\(const id of \['desktopAccountSlot','mobileAccountSlot'\]\)/);
 assert.match(ui,/b\.replaceChildren\(\)/);
 assert.match(ui,/const name=String\(user\.displayName/);
 assert.match(ui,/const avatar=el\('span','cf-trigger-avatar'/);
 assert.doesNotMatch(ui,/const label=el\('span','cf-trigger-name',name\)/);
 assert.match(ui,/b\.append\(avatar\)/);
 assert.match(ui,/document\.createElementNS\('http:\/\/www\.w3\.org\/2000\/svg','svg'\)/);
 assert.match(ui,/b\.setAttribute\('aria-label','로그인'\)/);
 assert.match(ui,/img\.referrerPolicy='no-referrer'/);
 assert.match(ui,/img\.addEventListener\('error'/);
 assert.match(ui,/b\.setAttribute\('aria-label',name\+' 계정 관리'\)/);
 assert.match(ui,/width:44px;min-width:44px;max-width:44px;height:44px/);
});
