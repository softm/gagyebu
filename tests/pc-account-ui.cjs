const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const app=path.resolve(__dirname,'..'),suite=process.env.SUITE_ROOT;
(async()=>{const browser=await chromium.launch();try{
 const ctx=await browser.newContext({serviceWorkers:'block'}),errors=[];
 await ctx.route('**/*', async r=>{
  const u=new URL(r.request().url());
  if(u.hostname!=='softm.github.io')return r.abort();
  if(u.pathname==='/shared/platform/v1/sdk.mjs')return r.fulfill({contentType:'text/javascript',body:`export async function createSiteClient({identityOnly,siteId}){if(!identityOnly||siteId!=='gagyebu')throw Error('Unexpected site');let user=null,cb;return {get currentUser(){return user;},onUser(f){cb=f;f(user);return ()=>{};},async login({popup,mode}){if(!popup)throw Error('Popup missing');popup.close();cb(user={uid:'fixture',displayName:'검증 계정'});return user;},async logout(){cb(user=null);}};}`});
  let base,p;if(u.pathname.startsWith('/gagyebu/')){base=app;p=u.pathname.slice('/gagyebu/'.length)||'index.html';}else {base=suite;p=u.pathname.slice(1);}
  try{const data=await fs.readFile(path.join(base,p));return r.fulfill({body:data,contentType:p.endsWith('.css')?'text/css':/\.m?js$/.test(p)?'application/javascript':p.endsWith('.html')?'text/html':'application/octet-stream'});}catch{return r.fulfill({status:404,body:''});}
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://softm.github.io/gagyebu/');
 const before=await page.evaluate(async()=>{const db=await import('./src/db.js'),domain=await import('./src/domain.js');await db.saveState(domain.createDemoState());return JSON.stringify(await db.loadState());});await page.reload();
 for(const width of [1280,768,390,320]){
  await page.setViewportSize({width,height:800});const slot=width>830?'desktopAccountSlot':'mobileAccountSlot';
  const trigger=page.locator('#'+slot+' softm-site-account #profile');await trigger.waitFor();
  const b=await trigger.boundingBox();assert(b.width>=44&&b.height>=44&&b.x>=0&&b.x+b.width<=width);
  await trigger.click();assert(await page.locator('softm-account-popover #signup').isVisible());await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:1280,height:800});
 await page.locator('#desktopNav [data-tab="settings"]').click();
 assert(!await page.getByText('Firebase 연결 안내').count());await page.locator('[data-action=suite-menu]').click();
 await page.locator('softm-account-popover #login').click();await page.getByText('검증 계정 · 로그인됨').waitFor();
 await page.locator('[data-action=suite-delete]').waitFor();page.once('dialog',d=>d.dismiss());await page.locator('[data-action=suite-delete]').click();
 await page.locator('[data-action=suite-menu]').click();await page.locator('softm-account-popover #logout').click();
 await page.getByText('모바일과 같은 한눈 계정으로 로그인하세요.').waitFor();assert.equal(await page.evaluate(async()=>JSON.stringify(await (await import('./src/db.js')).loadState())),before);assert.deepEqual(errors,[]);
 console.log('PASS: responsive profile, login popup, settings, delete cancellation and logout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
