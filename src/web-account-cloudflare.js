
const WORKER='https://softm-hannun-account.softm.workers.dev';
const CLIENT='https://softm.github.io/services/cloudflare-account/src/client.mjs?v=gagyebu-pc-1';

let mounted=null;
function el(tag,className,text){
 const node=document.createElement(tag);if(className)node.className=className;
 if(text!==undefined)node.textContent=text;return node;
}
export async function mountCloudflareWebAccount(changed){
 if(mounted)return mounted;
 const {createCloudflareAccountClient}=await import(CLIENT);
 const client=createCloudflareAccountClient({baseUrl:WORKER,siteId:'gagyebu'});
 const account={backend:'cloudflare',get currentUser(){const user=client.currentUser;return user?{uid:user.uid,displayName:'Cloudflare 공통 계정'}:null;},
  login:()=>client.login(),logout:()=>client.logout(),exchangeLedger:payload=>client.exchangeLedger(payload)};
 const style=el('style');style.textContent=`
 .cf-gagyebu-trigger{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;padding:0;border:1px solid #d8e1e7;border-radius:50%;background:#fff;color:#243d54;cursor:pointer;font-weight:700}
 .cf-gagyebu-overlay{position:fixed;inset:0;background:#0e192c85;z-index:999999;display:grid;place-items:center;padding:16px}
 .cf-gagyebu-dialog{background:#fff;color:#172635;border-radius:18px;width:min(100%,420px);padding:22px;box-shadow:0 14px 50px #0003}
 .cf-gagyebu-dialog h2{margin:0 0 8px;font-size:22px}
 .cf-gagyebu-dialog p{font-size:14px;line-height:1.65;color:#5b6a7b}
 .cf-gagyebu-dialog button{display:block;width:100%;padding:13px;margin-top:10px;border:1px solid #d9e1eb;border-radius:10px;background:#f6f9fb;color:#192c43;cursor:pointer}
 .cf-gagyebu-dialog button.primary{background:#213f5e;color:#fff;border:0}
 .cf-gagyebu-dialog button:disabled{opacity:.45;cursor:not-allowed}
 `;
 document.head.append(style);
 const overlay=el('div','cf-gagyebu-overlay');overlay.hidden=true;
 // The overlay must not consume input when closed.
 overlay.style.display='none';
 const dialog=el('div','cf-gagyebu-dialog');dialog.setAttribute('role','dialog');
 dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','한눈 계정');
 overlay.append(dialog);document.body.append(overlay);
 function close(){overlay.hidden=true;overlay.style.display='none';}
 function show(){overlay.hidden=false;overlay.style.display='grid';render();}
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 function action(text,callback,primary=false){
  const b=el('button',primary?'primary':'',text);
  b.type='button';b.addEventListener('click',async()=>{
   b.disabled=true;
   try{await callback();}catch(e){message.textContent=e.message||'계정 연결에 실패했습니다.';}
   finally{b.disabled=false;renderTriggers();}
  });
  dialog.append(b);return b;
 }
 const message=el('p');message.setAttribute('role','status');
 function render(){
  dialog.replaceChildren();
  dialog.append(el('h2','', '한눈 공통 계정'));
  const user=account.currentUser;
  dialog.append(el('p','',user?'Cloudflare 계정으로 로그인되어 있습니다.':'Google 계정으로 로그인하고 PC 가계부를 동기화하세요.'));
  if(user){
   dialog.append(el('p','', '로그인됨 · 계정별 장부는 암호화되어 D1에 저장됩니다.'));
   action('로그아웃',async()=>{
     await account.logout();await changed(null);close();renderTriggers();
   },true);
  }else{
   action('Google로 계속하기',async()=>{
     // client.login() opens the popup before its first await.
     const next=await account.login();
     await changed(next);close();renderTriggers();
   },true);
  }
  const manage=el('a','', '공통 계정관리 열기');
  manage.href=WORKER+'/account';manage.target='_blank';manage.rel='noopener noreferrer';
  manage.style.display='block';manage.style.textAlign='center';manage.style.marginTop='14px';
  dialog.append(manage);
  action('닫기',async()=>close());
  dialog.append(message);message.textContent='';
 }
 const buttons=[];
 function renderTriggers(){
  for(const b of buttons){b.textContent=account.currentUser?'계정 ✓':'계정';b.setAttribute('aria-label',account.currentUser?'한눈 공통 계정 관리':'한눈 공통 계정 로그인');}
 }
 for(const id of ['desktopAccountSlot','mobileAccountSlot']){
  const target=document.getElementById(id);if(!target)continue;
  const b=el('button','cf-gagyebu-trigger');b.type='button';b.addEventListener('click',show);
  target.replaceChildren(b);buttons.push(b);
 }
 renderTriggers();
 const initial=account.currentUser;await changed(initial);
 mounted={menu:{open:show,element:buttons[0]||null},account,exchangeLedger:account.exchangeLedger};
 return mounted;
}
