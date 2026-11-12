// Safe progressive Cloudflare cutover for gagyebu PC.
// If the D1 ledger key isn't configured, retain the legacy adapter and data.
const WORKER='https://softm-hannun-account.softm.workers.dev';
let impl=null,loading=null;
async function backend(){
 if(impl)return impl;
 if(!loading)loading=(async()=>{
   // A temporary network failure must never silently switch an existing
   // Cloudflare account to the unrelated Firebase identity/ledger namespace.
   // The local IndexedDB ledger remains available while login is unavailable.
   let response,health;
   try{
     response=await fetch(WORKER+'/health',{cache:'no-store',signal:AbortSignal.timeout(8000)});
     if(!response.ok)throw Error('Cloudflare 계정 서버 연결을 확인할 수 없습니다. 로컬 장부는 유지됩니다.');
     health=await response.json();
   }catch{
     throw Error('Cloudflare 계정 서버에 연결하지 못했습니다. 기존 장부는 이 기기에 보관됩니다. 연결 후 다시 시도하세요.');
   }
   if(health.ok!==true)throw Error('Cloudflare 계정 서버가 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
   // An explicitly disabled D1 feature can still opt into the legacy bridge.
   return health.features?.gagyebuLedger===true
     ?import('./web-account-cloudflare.js')
     :import('./web-account-legacy.js');
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
