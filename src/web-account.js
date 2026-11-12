// Safe progressive Cloudflare cutover for gagyebu PC.
// If the D1 ledger key isn't configured, retain the legacy adapter and data.
const WORKER='https://softm-hannun-account.softm.workers.dev';
let impl=null,loading=null;
async function backend(){
 if(impl)return impl;
 if(!loading)loading=(async()=>{
   let cloudflareReady=false;
   try{
     const response=await fetch(WORKER+'/health',{cache:'no-store',signal:AbortSignal.timeout(8000)});
     if(response.ok){
       const health=await response.json();
       cloudflareReady=health.ok===true&&health.features?.gagyebuLedger===true;
     }
   }catch{
     // No account-module outage may erase or replace an offline ledger.
   }
   return cloudflareReady?import('./web-account-cloudflare.js'):import('./web-account-legacy.js');
 })().then(module=>{impl=module;return module;}).finally(()=>loading=null);
 return loading;
}
export async function mountWebAccount(changed){
 const module=await backend();
 return module.mountCloudflareWebAccount?module.mountCloudflareWebAccount(changed):module.mountWebAccount(changed);
}
export async function exchangeLedger(payload){
 const module=await backend();
 if(module.mountCloudflareWebAccount){
   const mounted=await module.mountCloudflareWebAccount(()=>{});
   return mounted.exchangeLedger(payload);
 }
 return module.exchangeLedger(payload);
}
export async function deleteVault(account,toast){
 const module=await backend();
 if(module.mountCloudflareWebAccount)throw Error('Cloudflare 보관소 삭제 기능은 아직 지원되지 않습니다. JSON 백업을 이용하세요.');
 return module.deleteVault(account,toast);
}
