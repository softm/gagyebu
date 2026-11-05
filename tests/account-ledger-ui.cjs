const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch(),rows=new Map();let counter=0;
try{
 async function device(root,name){
  const ctx=await browser.newContext(),p=await ctx.newPage();p.on('dialog',d=>d.accept());
  await p.route('https://ledger.test/**',async r=>{const url=new URL(r.request().url());if(url.pathname==='/')return r.fulfill({contentType:'text/html',body:'<title>Sync test</title>'});return r.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,url.pathname))});});
  await p.exposeFunction('exchange',body=>{const old=rows.get(body.uid);if(body.op==='read')return {revision:old?.revision||null,...(old&&old.revision!==body.known?{ledger:old.ledger}:{})};if(body.expected!==(old?.revision||null))return {conflict:true};const revision=String(++counter);rows.set(body.uid,{ledger:body.ledger,revision});return {revision};});
  await p.goto('https://ledger.test/');await p.evaluate(async name=>{
   const {initialState}=await import('/domain.js'),{saveState,loadState}=await import('/db.js'),{startLedger}=await import('/account-ledger.js');window.state=initialState();
   const t={id:name,kind:'expense',date:'2026-11-05',amount:100,title:name,accountId:state.accounts[0].id,categoryId:'other-expense',status:'confirmed',sourceText:'never upload',memo:'',createdAt:new Date().toISOString()};
   state.transactions=[t];await saveState(state);
   window.sync=startLedger({getState:()=>state,setState:s=>window.state=s,isBusy:()=>false,status:s=>window.label=s,request:async b=>{if(window.offline)throw Error('offline');return exchange(b);}});
   window.put=async(id,value)=>{const next=structuredClone(state);if(value==null)next.transactions=next.transactions.filter(t=>t.id!==id);else next.transactions.find(t=>t.id===id).amount=value;await saveState(next);window.state=next;sync.changed();};window.guest=()=>loadState(null);
   await sync.select('same-user');
  },name);return p;
 }
 const pc=await device(path.resolve(__dirname,'../src'),'pc');await pc.waitForFunction(()=>label==='동기화됨');
 const phone=await device(process.env.ANDROID_WEB_SRC,'phone');await phone.waitForFunction(()=>label==='동기화됨');
 const refresh=async p=>p.evaluate(()=>window.dispatchEvent(new Event('online')));
 await refresh(pc);await pc.waitForFunction(()=>state.transactions.length===2);
 assert(!JSON.stringify(rows.get('same-user')).includes('never upload'));
 await phone.evaluate(()=>put('pc',250));await phone.waitForFunction(()=>label==='동기화됨');await refresh(pc);await pc.waitForFunction(()=>state.transactions.find(t=>t.id==='pc').amount===250);
 await pc.evaluate(async()=>{window.offline=true;await put('pc',400);});await phone.evaluate(()=>put('pc',350));await phone.waitForFunction(()=>label==='동기화됨');
 await pc.evaluate(()=>{window.offline=false;sync.changed();});await pc.waitForFunction(()=>label.startsWith('충돌'));await pc.evaluate(()=>sync.resolve('remote'));await pc.waitForFunction(()=>state.transactions.find(t=>t.id==='pc').amount===350);
 await pc.evaluate(()=>put('phone',null));await pc.waitForFunction(()=>label==='동기화됨');await refresh(phone);await phone.waitForFunction(()=>state.transactions.length===1);
 await pc.evaluate(()=>sync.select(null));assert.deepEqual(await pc.evaluate(()=>state.transactions.map(t=>[t.id,t.amount])),[['pc',100]]);
 console.log('PASS: two independent PC/Android IndexedDB clients, initial merge, edits both ways, offline conflict, deletion, guest isolation, private fields omitted.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
