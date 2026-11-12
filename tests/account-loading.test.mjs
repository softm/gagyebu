import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('desktop and mobile account slots start with a circular loading indicator',()=>{
 const html=read('index.html');
 assert.equal((html.match(/class="account-entry-button is-loading"/g)||[]).length,2);
 assert.match(html,/aria-busy="true" disabled/);
 assert.match(html,/@keyframes account-entry-spin/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/setTimeout\(\(\)=>\{/);
 assert.match(html,/로그인 다시 시도/);
});

test('successful PC account bootstrap replaces loading entry with normal login or avatar',()=>{
 const account=read('src/web-account-cloudflare.js');
 assert.match(account,/slot|desktopAccountSlot/);
 assert.match(account,/target\.replaceChildren\(b\)/);
 assert.match(account,/renderTriggers\(\)/);
 assert.match(account,/aria-busy/);
 assert.match(account,/cf-gagyebu-spin/);
});

test('failed bootstrap exposes a retry and Android native account menu takes over slots',()=>{
 const app=read('src/app.js');
 const native=read('src/common-account.js');
 assert.match(app,/가계부 계정 초기화 실패/);
 assert.match(app,/button\.classList\.add\('is-loading'\)/);
 assert.match(app,/button\.classList\.remove\('is-loading'\)/);
 assert.match(native,/mountSiteAccount/);
 assert.match(native,/querySelector\('\[data-account-entry\]'\)\?\.remove\(\)/);
});
