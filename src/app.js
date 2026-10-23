import {KINDS,COLORS,initialState,money,isoDate,monthKey,shiftMonth,getPeriod,currentPeriodMonth,getSummary,getAccountBalances,calculateExpression,duplicateOf,suggestCategory,parsePastedLines,parseCsv,validateBackup,createDemoState} from './domain.js';
import {loadState,saveState,loadUserState,loadUserDirty,loadUserSynced,saveUserState} from './db.js';
import {CloudService} from './cloud.js';
import {mergeGuestLedger,rebaseOfflineChanges} from './ledger-sync.js';
import {initAds,updateAdContext} from './ads.js'; // SOFTM-ADFIT 날짜:20261022 : 거래 데이터와 분리된 광고 수명주기 연결
let state, busy=false, pendingImport=[], modalContext=null;
let authUser=null,activeUid=null,cloudReady=true,localDirty=false,cloudStatus='unconfigured',cloudMessage='';
let latestRemote=null;
const cloud=new CloudService({
 onAuth:async user=>{
  authUser=user;activeUid=user?.uid||null;cloudReady=!user;latestRemote=null;
  state=user?await loadUserState(user.uid):await loadState();
  localDirty=user?await loadUserDirty(user.uid):false;
  ui.month=currentPeriodMonth(state.settings.periodStartDay);render();
 },
 onLedger:async remote=>{
  if(!activeUid)return;latestRemote=remote;cloudReady=true;
  if(localDirty){render();return;} // Never discard unsent local edits.
  state=remote;await saveUserState(activeUid,remote,{dirty:false});
  ui.month=currentPeriodMonth(state.settings.periodStartDay);render();
 },
 onStatus:(kind,detail='')=>{cloudStatus=kind;cloudMessage=detail;if(state)render();},
 onError:message=>{if(state)toast(message,'error');},
 onSynchronized:async synced=>{
  if(!activeUid||!synced)return;
  state=synced;await saveUserState(activeUid,state,{dirty:false});localDirty=false;
  render();
 }
});
const ui={tab:'home',month:monthKey(),filter:'all',kindFilter:'all',query:'',accountFilter:'all',categoryFilter:'all',visible:80,day:null};
const $=(sel,ctx=document)=>ctx.querySelector(sel);
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const m=(v)=>money(v);
const dateFmt=(d)=>{if(!d)return '';const [y,mm,dd]=d.split('-');return `${Number(mm)}월 ${Number(dd)}일`;};
const id=()=>crypto.randomUUID();
const iconPaths={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 receipt:'<path d="M4 3h16v18l-4-2-4 2-4-2-4 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
 chart:'<path d="M4 20V12M10 20V5M16 20v-9M22 20V8"/>',
 wallet:'<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M15 14h6M6 6V3h12"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12M4.93 19.07l2.12-2.12m9.9-9.9 2.12-2.12"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 chevron:'<path d="m9 18 6-6-6-6"/>',
 chevronleft:'<path d="m15 18-6-6 6-6"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 edit:'<path d="m3 17-.5 4 4-.5L19 8l-3-3zM14 7l3 3"/>',
 trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M3 17v4h18v-4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
 alert:'<path d="M12 3 2 21h20zM12 9v5M12 18h.01"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 arrowup:'<path d="m5 14 7-7 7 7M12 7v13"/>',
 arrowdown:'<path d="m5 10 7 7 7-7M12 4v13"/>',
 arrowright:'<path d="M4 12h16m-7-7 7 7-7 7"/>',
 repeat:'<path d="M7 7h12v5m0-5-3-3m3 3-3 3M17 17H5v-5m0 5 3 3m-3-3 3-3"/>',
 shield:'<path d="M12 2 4 6v6c0 6 4 9 8 10 4-1 8-4 8-10V6z"/><path d="m9 12 2 2 4-4"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 10v6M12 7h.01"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
 spark:'<path d="m12 2 2 7 7 3-7 2-2 8-2-8-8-2 8-3z"/>',
 utensils:'<path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 1 4 4 4 7h-4"/>',
 coffee:'<path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z"/><path d="M16 10h2a3 3 0 0 1 0 6h-2M8 3v2M12 3v2"/>',
 cart:'<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H7"/>',
 train:'<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M8 7h8M8 12h.01M16 12h.01M8 17l-2 4M16 17l2 4M8 21h8"/>',
 house:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
 bag:'<path d="M5 8h14l-1 13H6z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/><path d="M8.5 12h2l1-2.2 2 4.5 1-2.3h2"/>',
 film:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/>',
 box:'<path d="m4 7 8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>',
 briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
 tag:'<path d="M20 13 13 20l-9-9V4h7z"/><circle cx="8.5" cy="8.5" r="1.2"/>',
 bank:'<path d="m3 9 9-6 9 6"/><path d="M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16M3 21h18"/>',
 cash:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9H6a2 2 0 0 1-2-2M17 15h1a2 2 0 0 1 2 2"/>',
 card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
 refund:'<path d="M9 7H5v-4M5 7a8 8 0 1 1-1 8"/><path d="M9 12h6"/>',
 transfer:'<path d="M7 7h12l-3-3m3 3-3 3M17 17H5l3 3m-3-3 3-3"/>'

};
function ico(n,size=20){return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[n]||iconPaths.info}</svg>`;}
const CATEGORY_VISUALS={
 food:{icon:'utensils',tone:'food'},cafe:{icon:'coffee',tone:'cafe'},grocery:{icon:'cart',tone:'grocery'},
 transport:{icon:'train',tone:'transport'},living:{icon:'house',tone:'living'},shopping:{icon:'bag',tone:'shopping'},
 health:{icon:'heart',tone:'health'},leisure:{icon:'film',tone:'leisure'},bill:{icon:'receipt',tone:'bill'},
 'other-expense':{icon:'box',tone:'other'},salary:{icon:'briefcase',tone:'salary'},side:{icon:'spark',tone:'side'},
 'other-income':{icon:'wallet',tone:'income'}
};
const CATEGORY_TONE_COLORS={
 food:'#FF5252',cafe:'#FF8A34',grocery:'#10B981',transport:'#3B82F6',living:'#22A06B',
 shopping:'#8B5CF6',health:'#14B8A6',leisure:'#EC4899',bill:'#F59E0B',other:'#94A3B8',
 salary:'#2563EB',side:'#D97706',income:'#0EA5A4',refund:'#10B981',transfer:'#64748B',repayment:'#8B5CF6'
};
function categoryVisual(catOrId){
 const c=typeof catOrId==='string'?category(catOrId):catOrId;
 if(!c)return {icon:'tag',tone:'other'};
 const byId=CATEGORY_VISUALS[c.id];if(byId)return byId;
 const n=String(c.name||'').toLowerCase();
 if(/카페|커피|간식/.test(n))return CATEGORY_VISUALS.cafe;
 if(/장보|마트|식자재/.test(n))return CATEGORY_VISUALS.grocery;
 if(/교통|버스|지하철|주유|택시/.test(n))return CATEGORY_VISUALS.transport;
 if(/식비|외식|음식/.test(n))return CATEGORY_VISUALS.food;
 if(/의료|건강|병원|약/.test(n))return CATEGORY_VISUALS.health;
 if(/쇼핑|의류|미용/.test(n))return CATEGORY_VISUALS.shopping;
 if(/문화|여가|영화|여행/.test(n))return CATEGORY_VISUALS.leisure;
 if(/공과금|통신|관리비/.test(n))return CATEGORY_VISUALS.bill;
 if(/생활|주거/.test(n))return CATEGORY_VISUALS.living;
 return c.type==='income'?{icon:'wallet',tone:'income'}:{icon:'tag',tone:'other'};
}
function categoryIcon(catOrId,size=19,extra=''){
 const v=categoryVisual(catOrId);
 return `<span class="category-icon-badge tone-${v.tone} ${extra}" aria-hidden="true">${ico(v.icon,size)}</span>`;
}
function categoryColor(catOrId){return CATEGORY_TONE_COLORS[categoryVisual(catOrId).tone]||CATEGORY_TONE_COLORS.other;}
function transactionVisual(t){
 if(t.kind==='expense')return categoryVisual(category(t.categoryId));
 if(t.kind==='income')return {icon:'arrowdown',tone:'income'};
 if(t.kind==='refund')return {icon:'refund',tone:'refund'};
 if(t.kind==='transfer')return {icon:'transfer',tone:'transfer'};
 if(t.kind==='repayment')return {icon:'card',tone:'repayment'};
 return {icon:'receipt',tone:'other'};
}
function transactionIcon(t){
 const v=transactionVisual(t);
 return `<span class="transaction-icon category-icon-badge tone-${v.tone}" aria-hidden="true">${ico(v.icon,19)}</span>`;
}
function accountIcon(kind){
 const v=kind==='card'?{icon:'card',tone:'shopping'}:kind==='cash'?{icon:'cash',tone:'salary'}:{icon:'bank',tone:'transport'};
 return `<span class="account-symbol ${kind} category-icon-badge tone-${v.tone}" aria-hidden="true">${ico(v.icon,21)}</span>`;
}

const NAV=[['home','홈','home'],['transactions','내역·정리함','receipt'],['calendar','달력','calendar'],['analytics','통계 · 분석','chart'],['accounts','자산','wallet'],['settings','설정','settings']];
function currentSummary(){return getSummary(state,ui.month);}
const pendingCount=()=>state.transactions.filter(t=>t.status==='pending').length;
const acc=(accountId)=>state.accounts.find(a=>a.id===accountId);
const category=(categoryId)=>state.categories.find(c=>c.id===categoryId);
function empty(icon,title,detail,action=''){return `<div class="empty"><span class="empty-icon">${icon}</span><h3>${title}</h3><p>${detail}</p>${action}</div>`;}
function btn(label,action,extra='',classes='btn btn-primary'){return `<button class="${classes}" data-action="${action}" ${extra}>${label}</button>`;}
function statsBadge(value,mode=''){return `<span class="amount ${mode}">${esc(value)}</span>`;}
function toast(message,type='info'){
 const el=$('#toast');el.innerHTML=`<span>${type==='error'?ico('alert',17):ico('check',17)}</span>${esc(message)}`;el.className=`toast show ${type}`;
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.className='toast';},4200);
}
async function mutate(fn,notice='저장했습니다.'){
 if(busy)return;
 if(activeUid&&!cloudReady){toast('클라우드 가계부를 불러오는 중입니다. 잠시 기다려 주세요.','error');return;}
 busy=true;
 try{
  const before=structuredClone(state),next=structuredClone(state);
  fn(next);validateBackup(next);
  if(activeUid){await saveUserState(activeUid,next,{dirty:true});localDirty=true;}
  else await saveState(next);
  state=next;render();if(notice)toast(notice);
  if(activeUid)cloud.queueDiff(before,next).catch(e=>{console.error('Firestore sync:',e);toast('로컬에 저장했으나 클라우드 동기화에 실패했습니다. 설정에서 재전송하세요.','error');});
 }catch(e){console.error(e);toast(`저장하지 못했습니다: ${e.message}`,'error');}
 finally{busy=false;}
}
function render(){
 const existing=document.documentElement.dataset.theme;document.documentElement.dataset.theme=state.settings.theme||'light';
 const nowCount=pendingCount();const nav= NAV.map(([tab,label,icon])=>`<button class="nav-link ${ui.tab===tab?'active':''}" data-tab="${tab}" aria-current="${ui.tab===tab?'page':'false'}">${ico(icon,20)}<span>${label}</span>${tab==='transactions'&&nowCount?`<b class="nav-counter">${nowCount}</b>`:''}</button>`).join('');
 $('#desktopNav').innerHTML=nav;$('#mobileNav').innerHTML=nav;$('#brandSub').textContent='차곡차곡, 나의 돈 이야기';
 $('#sideBottom').innerHTML=`<div class="side-peek"><span class="side-peek-icon">${ico('shield',18)}</span><strong>${activeUid?'내 전용 클라우드 장부':'로컬 우선 가계부'}</strong><small>${esc(syncDescription())}</small></div><button class="sidebar-account-btn" data-tab="settings">${ico('shield',16)} ${activeUid?'내 계정·동기화':'로그인·동기화'}</button>`;
 $('#page').innerHTML=({home:renderHome,transactions:renderTransactions,calendar:renderCalendar,analytics:renderAnalytics,accounts:renderAccounts,settings:renderSettings})[ui.tab]();
 const tabTitle=NAV.find(x=>x[0]===ui.tab)?.[1]||'가계부';$('#mobileTitle').textContent=tabTitle;
 updateAdContext({tab:ui.tab,filter:ui.filter,modalOpen:!!modalContext}); // SOFTM-ADFIT 날짜:20261022 : 화면 전환에서 광고 위치와 보호 상태만 갱신
}
function syncDescription(){
 if(!cloud.isConfigured())return 'Firebase 프로젝트 연결 전 · 이 기기에 저장';
 if(!activeUid)return '비로그인 모드 · 이 기기에 저장';
 if(localDirty)return '기기 변경사항 보관됨 · 전송 확인 필요';
 return ({loading:'클라우드 불러오는 중',saving:'Firestore 동기화 중',synced:'Firestore 동기화 완료',error:'동기화 오류 · 로컬 기록 보관'})[cloudStatus]||'연결 확인 중';
}
function renderAuthPanel(){
 const help='<a class="inline-link" target="_blank" rel="noopener noreferrer" href="https://github.com/softm/gagyebu/blob/main/docs/FIREBASE_SETUP.md">Firebase 연결 안내 ↗</a>';
 if(!cloud.isConfigured())return `<section class="panel account-panel"><div class="section-heading"><div><h2>계정 및 클라우드 보관</h2><p>로그인·동기화 연동 코드가 준비되었습니다.</p></div></div><p class="form-note">Firebase 프로젝트의 웹 설정값과 인증 제공자 설정을 등록해야 실제 로그인이 활성화됩니다. 그전까지 모든 기록은 이 브라우저에 보관됩니다.</p>${help}</section>`;
 if(!authUser)return `<section class="panel account-panel"><div class="section-heading"><div><h2>로그인 · 여러 기기 동기화</h2><p>로그인 후 내 장부가 Firestore에 저장됩니다. 비로그인 기록은 그대로 유지됩니다.</p></div></div>
 <div class="social-login-grid"><button type="button" class="social-btn social-kakao" data-action="login-kakao">카카오로 로그인</button><button type="button" class="social-btn social-naver" data-action="login-naver">네이버로 로그인</button><button type="button" class="social-btn social-google" data-action="login-google">${ico('shield',17)} Google로 로그인</button><button type="button" class="social-btn social-apple" data-action="login-apple">Apple로 로그인</button></div>
 <p class="privacy-note">계정마다 별도의 비공개 장부를 사용합니다. 이전 로컬 기록은 로그인 후 직접 가져오기를 선택할 수 있습니다. 다른 SNS로 로그인하면 별도 계정이 만들어질 수 있습니다.</p></section>`;
 const name=authUser.displayName||authUser.email||({kakao:'카카오 계정',naver:'네이버 계정'}[String(authUser.uid).split(':')[0]]||'로그인 사용자');
 return `<section class="panel account-panel"><div class="section-heading"><div><h2>내 계정과 클라우드 보관</h2><p>${esc(name)} · ${esc(syncDescription())}</p></div><span class="cloud-indicator ${localDirty||cloudStatus==='error'?'warn':'ok'}">${localDirty?'동기화 확인 필요':cloudStatus==='synced'?'동기화됨':cloudStatus==='saving'?'저장 중':'확인 중'}</span></div>
 <p class="privacy-note">거래 ${state.transactions.length.toLocaleString()}건 · 자산 ${state.accounts.length}개 · 카테고리 ${state.categories.length}개 · 예산·설정 · 영수증 사진은 사용자별로 보관됩니다.</p>
 ${cloudMessage?`<p class="form-note">${esc(cloudMessage)}</p>`:''}
 <div class="settings-actions">${btn('기기 기록 클라우드로 가져오기','merge-guest','','btn btn-secondary')}${localDirty?btn('미전송 기록 다시 동기화','retry-sync','','btn btn-primary'):''}${btn('로그아웃','logout','','btn btn-secondary')}</div>
 <p class="privacy-note">다른 소셜 계정의 장부는 자동으로 합치지 않습니다. 브라우저가 오프라인인 경우 로컬 변경사항이 보존되며, 클라우드 업로드 완료 여부를 확인하세요.</p></section>`;
}
function topBar(title,subtitle='',period=true,actions=''){
 const s=currentSummary();return `<div class="page-head"><div><p class="eyebrow">GAGYEBU · 가계부</p><h1>${title}</h1>${subtitle?`<p class="subtitle">${subtitle}</p>`:''}</div><div class="head-right">${period?`<div class="period-nav"><button class="icon-btn" data-action="prev-month" aria-label="이전 기간">${ico('chevronleft',19)}</button><span>${esc(s.period.label)}</span><button class="icon-btn" data-action="next-month" aria-label="다음 기간">${ico('chevron',19)}</button></div>`:''}${actions}</div></div>`;
}
function recentList(items,limit=5){if(!items.length)return empty('✦','아직 기록이 없어요','오른쪽 위의 기록 추가 버튼으로 시작해 보세요.');return `<div class="transaction-list">${items.slice(0,limit).map(t=>transactionRow(t,true)).join('')}</div>`;}
function kindLabel(kind){return KINDS[kind]||kind;}
function transactionRow(t,compact=false){
 const cat=category(t.categoryId);const badge={expense:'negative',income:'positive',refund:'positive',transfer:'neutral',repayment:'neutral'}[t.kind];
 const direction=t.kind==='expense'||t.kind==='repayment'||t.kind==='transfer'?'-':'+';
 const sign=t.kind==='transfer'||t.kind==='repayment'?'':direction;
 const dup=t.status==='pending'?duplicateOf(t,state.transactions):null;
 const to=t.toAccountId?` → ${acc(t.toAccountId)?.name||'미지정'}`:'';
 return `<div class="transaction-row ${t.status==='pending'?'row-pending':''}">
 ${transactionIcon(t)}
 <div class="transaction-info"><div class="transaction-name">${esc(t.title)}${t.status==='pending'?`<span class="pill warning">확인 필요</span>`:''}${dup?`<span class="pill danger">중복 의심</span>`:''}${t.attachment||t.attachmentPath?`<span title="사진 첨부">${ico('image',14)}</span>`:''}</div><p>${dateFmt(t.date)} · ${esc(acc(t.accountId)?.name||'계정 미지정')}${esc(to)} · ${esc(cat?.name||kindLabel(t.kind))}</p></div>
 <div class="transaction-tail"><div class="transaction-amount ${badge}">${sign}${m(t.amount)}</div>${compact?'':`<div class="row-actions">${t.status==='pending'?`<button data-action="confirm-transaction" data-id="${esc(t.id)}" title="확정" aria-label="확정">${ico('check',16)}</button>`:''}<button data-action="edit-transaction" data-id="${esc(t.id)}" title="수정" aria-label="수정">${ico('edit',16)}</button>${t.kind==='expense'&&t.status==='confirmed'?`<button data-action="refund-transaction" data-id="${esc(t.id)}" title="환불 등록" aria-label="환불 등록">${ico('repeat',16)}</button>`:''}<button data-action="delete-transaction" data-id="${esc(t.id)}" title="삭제" aria-label="삭제">${ico('trash',16)}</button></div>`}</div></div>`;
}
function renderHome(){const s=currentSummary(),total=Math.max(1,s.budget),ratio=Math.max(0,Math.min(100,s.expense/total*100));
 const ordered=state.transactions.filter(t=>isWithin(t.date,s.period)).sort(sortTx);const pending=state.transactions.filter(t=>t.status==='pending').sort(sortTx);
 const top=Object.entries(s.byCategory).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,6);
 const loggedDays=new Set(ordered.filter(t=>t.status==='confirmed').map(t=>t.date)).size;
 const expenseCats=state.categories.filter(c=>c.type==='expense').slice(0,7);
 const daily=s.expense/Math.max(1,loggedDays||1);
 return `${topBar('오늘의 지출이 내일의 여유가 됩니다','지금 가계부로 똑똑한 소비 습관을 시작하세요! 작은 기록이 더 나은 내일을 만듭니다 :)',true,btn(`${ico('plus',17)} 기록 추가`,'add-transaction'))}
 ${!authUser&&cloud.isConfigured()?'<div class="account-prompt">여러 기기에서 기록을 쓰고 싶으신가요? <button data-tab="settings">로그인·동기화 설정 →</button></div>':''}
 <section class="hero-panel stitch-hero">
   <div class="hero-content">
     <div class="hero-pills"><span>${esc(s.period.label)} 월간 결산</span><em>똑똑한 소비 생활 · ${loggedDays}일 기록</em></div>
     <div class="hero-expense-label">이번 기간 총 지출</div>
     <div class="hero-total">${m(s.expense)}</div>
     <div class="hero-mini-row">
       <span>수입 <strong>${m(s.income)}</strong></span>
       <span>남은 예산 <strong>${m(s.remaining)}</strong></span>
       <span class="hero-daily">일평균 ${m(Math.round(daily))}</span>
     </div>
     <div class="hero-actions">
       <button class="hero-action primary" data-tab="transactions">지출 내역 전체보기 ${ico('arrowright',16)}</button>
       <button class="hero-action" data-tab="analytics">소비 분석 ${ico('chart',16)}</button>
     </div>
   </div>
   <div class="hero-mascot stitch-mascot" aria-hidden="true">
      <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAGzho8Y05S2G-l4bpRqJJfFa5ISEfXFOdLxvTizeG4y3ZWjeyMStILtLXcejn4BsqG1-1-O-jh5_EpHAmsXxzuPFF6htujTUBptmi0D1lto4vR2QQiJKLjCcohF9aNG_tqqABbCzNzlbGqKOQNP7r6rpv-ew9ODM-bu8T58sMrgFvPxlGQmvxWTG4v8fqielwopHlQtQMJ_YZ9JxsA7c8_-KOttEQLGZDmcB4nkCg8jjKcmDVODGEIYpi6nstz-a6NKnw" alt="" />
   </div>
 </section>
 <section class="summary-grid stitch-kpis">
   <div class="metric-card income">
     <div class="metric-head"><span class="metric-dot blue"></span><span class="metric-label">수입</span><span class="metric-icon positive">${ico('arrowup',18)}</span></div>
     <div class="metric-value income-value">${m(s.income)}</div><p>이번 정산기간 들어온 돈</p>
   </div>
   <div class="metric-card expense">
     <div class="metric-head"><span class="metric-dot pink"></span><span class="metric-label">지출</span><span class="metric-icon negative">${ico('arrowdown',18)}</span></div>
     <div class="metric-value expense-value">${m(s.expense)}</div><p>예산의 ${Math.round(ratio*10)/10}% 사용 · 환불 반영</p>
   </div>
   <div class="metric-card budget">
     <div class="metric-head"><span class="metric-dot gold"></span><span class="metric-label">잔액 (예산 잔여)</span><span class="metric-icon violet">${ico('wallet',18)}</span></div>
     <div class="metric-value budget-value ${s.remaining<0?'negative':''}">${m(s.remaining)}</div>
     <div class="metric-budget-foot"><span>총예산 ${m(s.budget)}</span><strong>${s.remaining>=0?'여유 잔액 충분 🎉':'예산 초과 확인 필요'}</strong></div>
     <div class="mini-progress"><i style="width:${Math.min(100,ratio)}%"></i></div>
   </div>
 </section>
 ${pending.length?`<section class="attention-card"><div class="attention-icon">${ico('clock',24)}</div><div><h3>확인할 거래가 ${pending.length}건 있어요</h3><p>검토 전 기록은 지출과 자산 잔액에 포함되지 않아요.</p></div><button data-action="view-pending" class="btn btn-light">정리하기 ${ico('arrowright',16)}</button></section>`:''}
 <div class="home-columns stitch-split">
   <section class="panel transactions-panel">
     <div class="section-heading stitch-section-heading"><div><h2>최근 지출 내역</h2><p>복잡한 설정 없이 간편하게 기록하세요.</p></div><button class="text-btn" data-tab="transactions">전체 보기 ${ico('chevron',16)}</button></div>
     <div class="home-filter-pills"><span class="active">전체</span><span>지출</span><span>수입</span><span>이체</span></div>
     ${recentList(ordered,7)}
     <button class="quick-add-row" data-action="add-transaction">${ico('plus',18)} <span>새로운 거래 내역 바로 추가하기</span></button>
   </section>
   <section class="panel insight-panel">
     <div class="section-heading stitch-section-heading"><div><h2>한눈에 보는 지출 분석</h2><p>차트로 확인하는 나의 소비 패턴</p></div><button class="text-btn" data-tab="analytics">통계 보기 ${ico('chevron',16)}</button></div>
     ${renderDonut(s,top)}
     <div class="quick-card mascot-tip"><span>🐷</span><div><strong>지금 쓰는 기록이 더 나은 내일을 만듭니다 :)</strong><p>작은 변화도 꾸준히 기록하면 소비 패턴이 더 선명해져요.</p></div></div>
   </section>
 </div>
 <div class="stitch-secondary-grid">
   <section class="panel habit-panel">
     <div class="section-heading stitch-section-heading"><div><h2>꾸준히 기록하는 습관 만들기</h2><p>작은 기록이 큰 변화를 만듭니다.</p></div><span class="habit-badge">${loggedDays}일 기록</span></div>
     <div class="habit-days">${Array.from({length:7},(_,i)=>`<span class="${i<Math.min(7,loggedDays)?'done':''}">${['월','화','수','목','금','토','일'][i]}</span>`).join('')}</div>
     <div class="habit-note">${loggedDays?'이번 기간에도 차곡차곡 기록하고 있어요 ✨':'오늘 첫 기록을 남겨보세요 🐷'}</div>
     <button class="text-btn habit-link" data-tab="calendar">달력 전체보기 ${ico('chevron',16)}</button>
   </section>
   <section class="panel category-preview">
     <div class="section-heading stitch-section-heading"><div><h2>다양한 카테고리로 더 깔끔하게</h2><p>생활에 맞춘 카테고리로 체계적인 관리</p></div><button class="text-btn" data-tab="settings">설정 ${ico('chevron',16)}</button></div>
     <div class="category-preview-list">${expenseCats.map(c=>`<span class="category-preview-item">${categoryIcon(c,20,'category-preview-icon')}<em>${esc(c.name)}</em></span>`).join('')}</div>
     <p class="category-preview-foot">기본 카테고리 + 사용자 정의 분류를 함께 사용할 수 있어요.</p>
   </section>
 </div>
 ${!state.transactions.length?`<div class="starter-banner"><div><strong>쉽고 편한 가계부를 먼저 둘러보세요</strong><p>샘플 데이터로 디자인과 기능을 확인한 뒤 내 기록을 시작할 수 있습니다.</p></div>${btn('샘플 데이터 둘러보기','load-demo','','btn btn-secondary')}</div>`:''}`;
}
const isWithin=(d,p)=>d>=p.start&&d<p.end;
const sortTx=(a,b)=>b.date.localeCompare(a.date)||String(b.createdAt||'').localeCompare(String(a.createdAt||''));
function renderDonut(summary,parts){
 if(!parts.length)return empty('◌','아직 지출이 없어요','지출을 기록하면 분류별 비중이 표시됩니다.');
 const sum=parts.reduce((a,b)=>a+b[1],0);let degree=0;
 const grad=parts.map(([id,val])=>{const from=degree;degree+=val/Math.max(sum,1)*360;return `${categoryColor(category(id))} ${from}deg ${degree}deg`;}).join(',');
 return `<div class="donut-section"><div class="donut" style="background:conic-gradient(${grad});"><div class="donut-center"><span>총 지출</span><strong>${m(summary.expense)}</strong></div></div><div class="donut-legend">${parts.map(([id,val])=>`<div>${categoryIcon(category(id),15,'legend-category-icon')}<span>${esc(category(id)?.name||'미분류')}</span><strong>${m(val)}</strong></div>`).join('')}</div></div>`;
}
function renderTransactions(){
 const p=currentSummary().period;let txs=state.transactions.filter(t=>ui.filter==='pending'?t.status==='pending':ui.filter==='confirmed'?t.status==='confirmed':true);
 if(ui.filter!=='pending')txs=txs.filter(t=>isWithin(t.date,p));
 if(ui.kindFilter!=='all')txs=txs.filter(t=>t.kind===ui.kindFilter);
 if(ui.accountFilter!=='all')txs=txs.filter(t=>t.accountId===ui.accountFilter||t.toAccountId===ui.accountFilter);
 if(ui.categoryFilter!=='all')txs=txs.filter(t=>t.categoryId===ui.categoryFilter);
 if(ui.query.trim()){const q=ui.query.trim().toLowerCase();txs=txs.filter(t=>`${t.title} ${t.memo||''} ${t.amount} ${category(t.categoryId)?.name||''}`.toLowerCase().includes(q));}
 txs.sort(sortTx);const count=txs.length;
 return `${topBar('거래 내역','지출을 찾고, 수정하고, 확인하는 공간입니다.',true,btn(`${ico('plus',17)} 기록 추가`,'add-transaction'))}
 <div class="tabs"><button class="tab ${ui.filter==='all'?'active':''}" data-filter="all">전체 내역</button><button class="tab ${ui.filter==='confirmed'?'active':''}" data-filter="confirmed">확정 내역</button><button class="tab ${ui.filter==='pending'?'active':''}" data-filter="pending">확인 필요 <span class="count-chip">${pendingCount()}</span></button></div>
 <div class="panel no-gap"><div class="filterbar"><label class="search-field">${ico('search',18)}<input id="searchInput" aria-label="거래 검색" value="${esc(ui.query)}" placeholder="사용처, 금액, 메모 검색" /></label><div class="filter-selects"><select id="kindFilter" aria-label="거래 종류"><option value="all">전체 유형</option>${Object.entries(KINDS).map(([k,n])=>`<option value="${k}" ${ui.kindFilter===k?'selected':''}>${n}</option>`).join('')}</select><select id="accountFilter" aria-label="자산 필터"><option value="all">전체 자산</option>${state.accounts.map(a=>`<option value="${esc(a.id)}" ${ui.accountFilter===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select><select id="categoryFilter" aria-label="분류 필터"><option value="all">전체 분류</option>${state.categories.map(c=>`<option value="${esc(c.id)}" ${ui.categoryFilter===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div></div>
 <div class="list-head"><span><strong>${count.toLocaleString()}</strong>건의 거래</span><div>${btn(`${ico('upload',16)} 가져오기`,'open-import','','btn btn-small btn-secondary')}${btn(`${ico('download',16)} CSV`,'export-csv','','btn btn-small btn-ghost')}</div></div>
 ${count?`<div class="transaction-list full">${txs.slice(0,ui.visible).map(t=>transactionRow(t)).join('')}</div>${count>ui.visible?`<div class="centered">${btn(`더 보기 (${count-ui.visible}건 남음)`,'show-more','','btn btn-secondary')}</div>`:''}`:empty('🔎','검색된 내역이 없어요','필터를 바꾸거나 새 거래를 추가해보세요.',btn('새 거래 입력','add-transaction'))}</div>`;
}
function renderCalendar(){const [y,mon]=ui.month.split('-').map(Number);const first=new Date(y,mon-1,1),max=new Date(y,mon,0).getDate();const offset=(first.getDay()+6)%7;
 const days=['월','화','수','목','금','토','일'];const txs=state.transactions.filter(t=>t.status==='confirmed'&&t.date.startsWith(ui.month));
 const daily={};for(const t of txs){(daily[t.date]??={expense:0,income:0,count:0}).count++;if(t.kind==='expense')daily[t.date].expense+=t.amount;if(t.kind==='refund')daily[t.date].expense-=t.amount;if(t.kind==='income')daily[t.date].income+=t.amount;}
 const cells=Array.from({length:offset},()=>'<div class="day-cell muted"></div>');for(let n=1;n<=max;n++){const date=`${ui.month}-${String(n).padStart(2,'0')}`;const s=daily[date];const chosen=ui.day===date;cells.push(`<button class="day-cell ${date===isoDate()?'today':''} ${chosen?'selected':''}" data-day="${date}" title="${date} 거래 확인"><span>${n}</span>${s?`<small class="day-expense">${s.expense?'-'+compactMoney(s.expense):''}</small><small class="day-income">${s.income?'+'+compactMoney(s.income):''}</small>`:''}</button>`);}
 const selected=ui.day||isoDate(new Date(y,mon-1,Math.min(new Date().getDate(),max)));
 const entries=txs.filter(t=>t.date===selected).sort(sortTx);
 return `${topBar('달력','날짜별 소비와 수입을 한눈에 확인하세요.',true,btn(`${ico('plus',17)} 기록 추가`,'add-transaction'))}
 <div class="calendar-layout"><div class="panel calendar-panel"><div class="calendar-weekdays">${days.map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div><div class="calendar-note">${ico('info',16)} 달력은 일반 월 기준이며, 홈·통계는 설정된 정산 시작일을 따릅니다.</div></div><div class="panel"><div class="section-heading"><div><h2>${dateFmt(selected)} 기록</h2><p>${entries.length}건의 확정 거래</p></div><button data-action="add-on-selected-day" class="icon-btn" title="이 날짜에 기록 추가">${ico('plus',20)}</button></div>${entries.length?`<div class="transaction-list">${entries.map(t=>transactionRow(t)).join('')}</div>`:empty('🗓️','이 날은 기록이 없어요','날짜를 누르거나 거래를 추가해보세요.')}</div></div>`;
}
function compactMoney(x){const abs=Math.abs(x);return abs>=10000?(Math.round(x/1000)/10).toLocaleString('ko-KR')+'만':(x/1000).toFixed(x%1000?1:0)+'천';}
function renderAnalytics(){const s=currentSummary();const byCat=Object.entries(s.byCategory).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);const max=Math.max(1,...byCat.map(x=>x[1]));
 const trend=Array.from({length:6},(_,i)=>{const key=shiftMonth(ui.month,i-5);return {key,...getSummary(state,key)};});const maxTrend=Math.max(1,...trend.map(x=>x.expense));
 return `${topBar('소비 분석','숫자를 통해 내 지출 습관을 발견해 보세요.',true,btn(`${ico('download',17)} CSV 내보내기`,'export-csv','','btn btn-secondary'))}
 <section class="summary-grid analytic"><div class="metric-card"><span class="metric-label">기간 수입</span><div class="metric-value">${m(s.income)}</div><p>실제로 들어온 돈</p></div><div class="metric-card"><span class="metric-label">순지출</span><div class="metric-value">${m(s.expense)}</div><p>환불 반영 · 이체/상환 제외</p></div><div class="metric-card"><span class="metric-label">남은 예산</span><div class="metric-value">${m(s.remaining)}</div><p>설정한 총예산 ${m(s.budget)}</p></div></section>
 <div class="analytics-grid"><section class="panel"><div class="section-heading"><div><h2>카테고리별 지출</h2><p>무엇에 가장 많이 썼을까요?</p></div></div>${renderDonut(s,byCat.slice(0,7))}</section><section class="panel"><div class="section-heading"><div><h2>최근 6개 기간 소비</h2><p>설정된 정산 시작일 기준</p></div></div><div class="bar-chart">${trend.map(x=>`<div class="bar-item"><strong>${compactMoney(x.expense)}</strong><div class="bar-track"><div class="bar-fill" style="height:${Math.max(3,100*x.expense/maxTrend)}%"></div></div><small>${Number(x.key.slice(-2))}월</small></div>`).join('')}</div></section></div>
 <section class="panel"><div class="section-heading"><div><h2>분류별 사용 금액</h2><p>카테고리 예산은 각 행의 편집 버튼으로 설정할 수 있어요.</p></div></div>${byCat.length?byCat.map(([cid,val],i)=>{const lim=state.budgets[cid]||0;return `<div class="category-meter"><div class="category-name">${categoryIcon(category(cid),18,'category-meter-icon')}<div><strong>${esc(category(cid)?.name||'기타')}</strong><small>${lim?`예산 ${m(lim)}`:'예산 미설정'}</small></div></div><div class="category-amount"><strong>${m(val)}</strong><button class="icon-btn small" data-action="budget-category" data-id="${esc(cid)}" aria-label="분류 예산 설정">${ico('edit',15)}</button></div><div class="category-bar"><i style="width:${Math.min(100,Math.round(val/(lim||max)*100))}%;background:${categoryColor(category(cid))}"></i></div></div>`;}).join(''):empty('📈','분석할 거래가 없어요','지출 내역을 기록하면 비중과 추이가 나타납니다.')}</section>`;
}
function renderAccounts(){const bal=getAccountBalances(state);const debt=state.accounts.filter(a=>a.kind==='card').reduce((sum,a)=>sum+(bal[a.id]||0),0);const liquid=state.accounts.filter(a=>a.kind!=='card').reduce((sum,a)=>sum+(bal[a.id]||0),0);
 return `${topBar('자산 관리','통장과 카드의 흐름을 나누어 확인하세요.',false,btn(`${ico('plus',17)} 자산 추가`,'add-account'))}
 <div class="asset-hero"><div><span>순자산 추정</span><h2>${m(liquid-debt)}</h2><small>현금·계좌 합계에서 카드 사용 잔액을 차감한 값입니다.</small></div><button data-action="new-transfer" class="btn btn-light">${ico('repeat',17)} 계좌 이체</button></div>
 <div class="account-section"><div class="section-heading"><div><h2>내 자산 ${state.accounts.length}개</h2><p>초기잔액과 확정된 거래를 반영합니다.</p></div></div><div class="account-grid">${state.accounts.map(a=>`<div class="account-card"><div class="account-top">${accountIcon(a.kind)}<button class="icon-btn" data-action="edit-account" data-id="${esc(a.id)}" aria-label="자산 편집">${ico('edit',18)}</button></div><div class="account-name">${esc(a.name)} <span class="pill">${a.kind==='card'?'카드 부채':a.kind==='cash'?'현금':'은행 계좌'}</span></div><strong class="account-balance">${m(bal[a.id]||0)}</strong><p>${a.kind==='card'?'사용잔액은 갚아야 할 금액입니다.':'잔액이 음수면 거래 내역을 확인하세요.'}</p></div>`).join('')}</div></div>
 <section class="panel info-strip"><div>${ico('info',22)}</div><p><strong>카드대금은 지출로 중복 집계되지 않습니다.</strong><br/>신용카드 사용은 지출과 카드 부채를 늘리고, 카드상환은 은행 잔액과 카드 부채만 줄입니다.</p>${btn('상환 기록','new-repayment','','btn btn-secondary')}</section>`;
}
function renderSettings(){
 const s=state.settings;return `${topBar('설정','내 방식대로 가계부를 꾸미고, 기록을 직접 관리하세요.',false)}${renderAuthPanel()}<div class="settings-grid">
 <section class="panel"><div class="section-heading"><div><h2>예산과 정산기간</h2><p>예산과 월 시작일을 정해주세요.</p></div></div><form id="settingsForm" class="form-stacked"><label>월 예산 (원)<input name="monthlyBudget" inputmode="numeric" type="number" min="0" step="1" value="${s.monthlyBudget||0}" required /></label><label>정산 시작일<select name="periodStartDay">${Array.from({length:28},(_,i)=>i+1).map(v=>`<option value="${v}" ${v===Number(s.periodStartDay)?'selected':''}>매월 ${v}일</option>`).join('')}</select></label><label>화면 테마<select name="theme"><option value="light" ${s.theme!=='dark'?'selected':''}>라이트</option><option value="dark" ${s.theme==='dark'?'selected':''}>다크</option></select></label><button type="submit" class="btn btn-primary">설정 저장</button></form></section>
 <section class="panel"><div class="section-heading"><div><h2>나만의 분류</h2><p>거래 입력 시 선택할 수 있습니다.</p></div><button class="icon-btn" data-action="add-category" aria-label="카테고리 추가">${ico('plus',20)}</button></div><div class="category-settings">${state.categories.map(c=>`<div><span class="category-setting-main">${categoryIcon(c,17,'category-setting-icon')}<span><strong>${esc(c.name)}</strong><small>${c.type==='income'?'수입':'지출'}</small></span></span><button class="icon-btn small" data-action="edit-category" data-id="${esc(c.id)}" aria-label="분류 수정">${ico('edit',16)}</button></div>`).join('')}</div></section>
 <section class="panel"><div class="section-heading"><div><h2>백업과 데이터 관리</h2><p>비로그인 장부는 브라우저에, 로그인 장부는 사용자별 Firestore와 기기 캐시에 보관됩니다.</p></div></div><div class="settings-actions">${btn(`${ico('download',17)} JSON 전체 백업`,'export-json','','btn btn-secondary')}${btn(`${ico('upload',17)} JSON 복원`,'import-json','','btn btn-secondary')}${btn(`${ico('download',17)} 거래 CSV`,'export-csv','','btn btn-secondary')}${btn(`${ico('upload',17)} CSV·문자 가져오기`,'open-import','','btn btn-secondary')}</div><div class="notice-box">${ico('alert',18)} ${activeUid?'로그인 장부는 Firestore에 저장되지만 동기화 완료 전에는 기기 기록을 지우지 마세요. 영수증은 Cloud Storage를 사용합니다.':'비로그인 기록은 이 브라우저에만 보관됩니다. 기기 변경 전 JSON 백업을 내려받으세요.'}</div><div class="data-stats">현재 거래 <strong>${state.transactions.length.toLocaleString()}건</strong> · 확인 필요 <strong>${pendingCount()}건</strong> · 자산 <strong>${state.accounts.length}개</strong></div><button class="text-danger" data-action="reset-all">${activeUid?'로그인 장부 전체 초기화':'로컬 장부 전체 초기화'}</button></section>
 <section class="panel"><div class="section-heading"><div><h2>서비스 정보</h2></div></div><p class="settings-about"><strong>가계부 · GAGYEBU</strong><br/>기록을 더 간단하게, 돈의 흐름은 더 선명하게.</p><p class="settings-about">버전 0.3.0 · 오프라인 우선 웹앱(PWA) · Google/카카오/네이버 로그인 · Firebase Auth/Firestore · 수동입력/CSV/문자 붙여넣기 · 금융기관 자동 조회는 제공하지 않습니다.</p><a href="https://github.com/softm/gagyebu" target="_blank" rel="noopener noreferrer" class="inline-link">GitHub 프로젝트 ${ico('arrowright',15)}</a><p class="settings-about"><a class="inline-link" href="./privacy.html" target="_blank" rel="noopener noreferrer">개인정보처리방침</a><br/>조회 화면에는 Kakao AdFit 광고가 표시될 수 있습니다. 하단 광고는 접을 수 있으며 거래 입력·자산·설정 화면에는 표시하지 않습니다.</p></section></div>`;
}
// SOFTM-ADFIT 날짜:20261022 : 입력·가져오기·인증 모달을 여는 즉시 광고 리소스를 정리
function openModal(content,context={}){modalContext=context;$('#modalHost').innerHTML=`<div class="modal-backdrop" data-action="dismiss-modal"><div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(context.title||'상세 입력')}"><div class="dialog-head"><div><p class="eyebrow">GAGYEBU</p><h2>${esc(context.title||'입력')}</h2></div><button class="icon-btn" data-action="dismiss-modal" aria-label="닫기">${ico('close',22)}</button></div><div class="dialog-content">${content}</div></div></div>`;document.body.classList.add('modal-open');updateAdContext({tab:ui.tab,filter:ui.filter,modalOpen:true});setTimeout(()=>$('#modalHost input:not([type=hidden]),#modalHost select,#modalHost textarea')?.focus(),30);}
function closeModal(){modalContext=null;$('#modalHost').innerHTML='';document.body.classList.remove('modal-open');updateAdContext({tab:ui.tab,filter:ui.filter,modalOpen:false});} // SOFTM-ADFIT 날짜:20261022 : 입력을 마친 뒤 사용자의 광고 접힘 상태로 복원
const optionAccounts=(selected)=>state.accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===selected?'selected':''}>${esc(a.name)}${a.kind==='card'?' · 카드':''}</option>`).join('');
const optionCategories=(selected,type='expense')=>state.categories.filter(c=>c.type===type).map(c=>`<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');
function openTransaction(t=null,preset={}){
 const kind=preset.kind||t?.kind||'expense';const dat=preset.date||t?.date||isoDate();const acId=preset.accountId||t?.accountId||'bank';const toId=preset.toAccountId||t?.toAccountId||(kind==='repayment'?'card':'cash');
 const val=preset.amount||t?.expression||t?.amount||'';const cat=preset.categoryId||t?.categoryId||suggestCategory(t?.title||'',kind);
 const photo=t?.attachment&&/^data:image\/(png|jpeg|webp);base64,/i.test(t.attachment)?`<div class="attached-image"><img src="${esc(t.attachment)}" alt="첨부한 영수증"><button type="button" data-action="remove-photo" class="text-danger">사진 제거</button></div>`:t?.attachmentPath?'<div class="attached-image" id="remoteReceipt">영수증 사진 불러오는 중…</div>':'';
 openModal(`<form id="transactionForm" class="form-stacked"><div class="type-selector">${Object.entries(KINDS).map(([k,n])=>`<label><input type="radio" name="kind" value="${k}" ${kind===k?'checked':''}><span>${n}</span></label>`).join('')}</div>
 <div class="form-grid"><label>날짜<input name="date" type="date" value="${esc(dat)}" required /></label><label>자산 / 출금계좌<select name="accountId">${optionAccounts(acId)}</select></label></div>
 <label class="target-account">받는 계좌 / 카드상환 대상<select name="toAccountId">${optionAccounts(toId)}</select></label>
 <label>금액 (계산식도 입력 가능)<div class="amount-entry"><input name="expression" type="text" inputmode="decimal" maxlength="60" placeholder="예: 12000*3-2000" value="${esc(val)}" required /><span>원</span></div><small class="calc-result" id="calcPreview">금액이나 계산식을 입력하세요.</small></label>
 <label>사용처 / 내역<input name="title" type="text" maxlength="90" required placeholder="예: 점심 식사" value="${esc(preset.title||t?.title||'')}" /></label>
 <label class="category-field">분류<select name="categoryId">${optionCategories(cat,kind==='income'?'income':'expense')}</select></label>
 <label>메모<textarea name="memo" rows="2" maxlength="500" placeholder="기록할 내용을 적어주세요">${esc(t?.memo||'')}</textarea></label>
 <label>영수증 사진 <span class="muted-hint">(선택, 1.5MB 이하)</span><input name="attachment" type="file" accept="image/png,image/jpeg,image/webp" /></label>${photo}
 <label>저장 상태<select name="status"><option value="confirmed" ${(t?.status||preset.status)!=='pending'?'selected':''}>확정 · 자산과 통계에 반영</option><option value="pending" ${(t?.status||preset.status)==='pending'?'selected':''}>확인 필요 · 합계에서 제외</option></select></label>
 <div class="form-actions"><button type="button" data-action="dismiss-modal" class="btn btn-secondary">취소</button><button type="submit" class="btn btn-primary">${t?'변경 저장':'거래 저장'}</button></div></form>`,{title:t?'거래 수정':'새 거래 기록',transactionId:t?.id||null,refundOf:preset.refundOf||t?.refundOf||null,attachment:t?.attachment||null,attachmentPath:t?.attachmentPath||null});
 if(t?.attachmentPath&&!t?.attachment){cloud.getReceipt(t.attachmentPath).then(data=>{if(modalContext?.transactionId!==t.id)return;const container=$('#remoteReceipt');if(container)container.innerHTML=`<img src="${esc(data)}" alt="첨부한 영수증"><button type="button" data-action="remove-photo" class="text-danger">사진 제거</button>`;}).catch(()=>{const container=$('#remoteReceipt');if(container)container.textContent='사진을 가져오지 못했습니다. 네트워크와 Storage 설정을 확인하세요.';});}
 updateTransactionKind();updateCalcPreview();
}
function updateTransactionKind(){const form=$('#transactionForm');if(!form)return;const kind=form.querySelector('[name="kind"]:checked')?.value||'expense';const target=form.querySelector('.target-account');target.style.display=['transfer','repayment'].includes(kind)?'flex':'none';const categoryField=form.querySelector('.category-field');categoryField.style.display=['transfer','repayment'].includes(kind)?'none':'flex';
 const cat= form.elements.namedItem('categoryId');const old=cat.value;cat.innerHTML=optionCategories(old,kind==='income'?'income':'expense');
 const selectTarget=form.elements.namedItem('toAccountId');if(kind==='repayment' && acc(selectTarget.value)?.kind!=='card'){selectTarget.value=state.accounts.find(a=>a.kind==='card')?.id||'';}
}
function updateCalcPreview(){const form=$('#transactionForm');if(!form)return;const el=$('#calcPreview');try{const result=calculateExpression(form.elements.namedItem('expression').value);el.textContent=`계산 결과: ${m(result)} (계산식 저장)`;el.className='calc-result success';}catch{el.textContent='숫자 또는 + − × ÷ ( )를 이용해 입력하세요.';el.className='calc-result';}}
async function saveTransaction(e){e.preventDefault();const f=e.target;const get=(name)=>f.elements.namedItem(name)?.value||'';
 let amount;try{amount=calculateExpression(get('expression'));}catch(e){toast(e.message,'error');return;}
 const kind=f.querySelector('[name="kind"]:checked')?.value||'expense',accountId=get('accountId'),toAccountId=get('toAccountId');
 if(['transfer','repayment'].includes(kind)){
  if(accountId===toAccountId){toast('보내는 자산과 받는 자산이 같을 수 없습니다.','error');return;}
  if(kind==='transfer'&&(acc(accountId)?.kind==='card'||acc(toAccountId)?.kind==='card')){toast('카드 부채의 이동은 카드상환으로 기록하세요.','error');return;}
  if(kind==='repayment'&&(acc(accountId)?.kind==='card'||acc(toAccountId)?.kind!=='card')){toast('카드상환은 은행/현금에서 카드로 처리해야 합니다.','error');return;}
 }
 if(kind==='income'&&acc(accountId)?.kind==='card'){toast('카드 부채 감소는 수입 대신 환불이나 카드상환을 사용하세요.','error');return;}
 let attachment=modalContext?.attachment||null;
 const file=f.elements.namedItem('attachment')?.files?.[0];if(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1500000){toast('JPG, PNG, WebP 사진만 1.5MB 이하로 첨부할 수 있습니다.','error');return;}
  try{attachment=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('사진을 읽지 못했습니다.'));r.readAsDataURL(file);});}catch(err){toast(err.message,'error');return;}
 }
 const txId=modalContext?.transactionId||id();const existing=state.transactions.find(t=>t.id===txId);
 const input={id:txId,kind,date:get('date'),amount,expression:get('expression').replaceAll(',',''),title:get('title').trim()||'사용처 미입력',accountId,toAccountId:['transfer','repayment'].includes(kind)?toAccountId:null,categoryId:['transfer','repayment'].includes(kind)?null:get('categoryId'),memo:get('memo').trim(),status:get('status'),attachment,attachmentPath:file?null:(modalContext?.attachmentPath||null),refundOf:modalContext?.refundOf||null,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),source:existing?.source||'manual',sourceText:existing?.sourceText||null};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(new Date(`${input.date}T12:00:00`).getTime())){toast('올바른 거래 날짜를 선택하세요.','error');return;}
 if(input.title.length>90||!input.title){toast('내역을 입력해주세요.','error');return;}
 const dupe=duplicateOf(input,state.transactions);
 if(dupe&&!existing&&!window.confirm('비슷한 날짜·사용처·금액의 거래가 있습니다. 그래도 등록할까요?'))return;
 closeModal();await mutate(next=>{const ix=next.transactions.findIndex(t=>t.id===txId);if(ix<0)next.transactions.unshift(input);else next.transactions[ix]=input;next.events.push({id:id(),entityId:txId,action:existing?'update':'create',createdAt:new Date().toISOString()});next.events=next.events.slice(-500);},existing?'거래를 수정했습니다.':'거래를 기록했습니다.');
}
function openAccount(a=null){openModal(`<form id="accountForm" class="form-stacked"><label>자산 이름<input name="name" maxlength="32" value="${esc(a?.name||'')}" placeholder="예: 생활비 통장" required/></label><label>자산 유형<select name="kind"><option value="cash" ${a?.kind==='cash'?'selected':''}>현금</option><option value="bank" ${a?.kind==='bank'||!a?'selected':''}>은행·계좌</option><option value="card" ${a?.kind==='card'?'selected':''}>신용카드 (갚아야 할 잔액)</option></select></label><label>초기 잔액 / 카드 미상환액<input name="openingBalance" type="number" step="1" value="${a?.openingBalance||0}" required/></label><p class="form-note">계좌는 초기 가용잔액, 신용카드는 초기 카드 미상환액을 입력하세요. 기존 거래가 있으면 과거 잔액도 재계산됩니다.</p><div class="form-actions">${a&&!state.transactions.some(t=>t.accountId===a.id||t.toAccountId===a.id)?`<button type="button" class="btn btn-danger-outline" data-action="delete-account" data-id="${esc(a.id)}">삭제</button>`:''}<button type="button" class="btn btn-secondary" data-action="dismiss-modal">취소</button><button type="submit" class="btn btn-primary">자산 저장</button></div></form>`,{title:a?'자산 수정':'새 자산 추가',accountId:a?.id||null});}
async function saveAccount(ev){ev.preventDefault();const f=ev.target;const name=f.elements.name.value.trim(),kind=f.elements.kind.value,openingBalance=Number(f.elements.openingBalance.value),oldId=modalContext?.accountId;
 if(!name||!Number.isSafeInteger(openingBalance)){toast('이름과 정수 금액을 확인해주세요.','error');return;}
 const current=state.accounts.find(a=>a.id===oldId);if(current?.kind!==kind&&state.transactions.some(t=>t.accountId===oldId||t.toAccountId===oldId)){toast('거래가 있는 계좌의 유형은 변경할 수 없습니다.','error');return;}
 closeModal();await mutate(next=>{const i=next.accounts.findIndex(a=>a.id===oldId);const a={id:oldId||id(),name,kind,openingBalance};if(i<0)next.accounts.push(a);else next.accounts[i]=a;},'자산 정보를 저장했습니다.');}
function openCategory(c=null){openModal(`<form id="categoryForm" class="form-stacked"><label>분류 이름<input name="name" maxlength="32" required value="${esc(c?.name||'')}" placeholder="예: 자동차"/></label><label>분류 표시 기호 <input name="icon" maxlength="8" value="${esc(c?.icon||'')}" placeholder="선택 입력 · 화면 아이콘은 자동 통일"/></label><label>구분<select name="type"><option value="expense" ${c?.type!=='income'?'selected':''}>지출</option><option value="income" ${c?.type==='income'?'selected':''}>수입</option></select></label><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="dismiss-modal">취소</button><button class="btn btn-primary" type="submit">저장</button></div></form>`,{title:c?'분류 수정':'새 분류',categoryId:c?.id||null});}
async function saveCategory(e){e.preventDefault();const f=e.target;const name=f.elements.name.value.trim(),icon=f.elements.icon.value.trim()||'',type=f.elements.type.value,cid=modalContext?.categoryId;if(!name)return;
 if(cid){const prev=state.categories.find(c=>c.id===cid);if(prev?.type!==type&&state.transactions.some(t=>t.categoryId===cid)){toast('사용 중인 분류의 수입/지출 유형은 바꿀 수 없습니다.','error');return;}}
 closeModal();await mutate(next=>{const i=next.categories.findIndex(c=>c.id===cid);const cat={id:cid||id(),name,icon,type};if(i<0)next.categories.push(cat);else next.categories[i]=cat;},'분류를 저장했습니다.');}
function openBudget(cid){const c=category(cid);openModal(`<form id="budgetForm" class="form-stacked"><p class="form-note">${esc(c?.name||'분류')}의 월별 예산 목표입니다. 총예산과 별도로 관리합니다.</p><label>월 예산 (원)<input name="amount" type="number" min="0" step="1" value="${state.budgets[cid]||0}" required/></label><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="dismiss-modal">취소</button><button class="btn btn-primary" type="submit">적용</button></div></form>`,{title:'카테고리 예산',categoryId:cid});}
function openImport(){openModal(`<div class="import-help"><p>금융 문구를 한 줄씩 붙여넣거나 CSV 파일을 선택하세요. 가져온 내역은 먼저 <strong>확인 필요함</strong>으로 저장되며 합계에 포함되지 않습니다.</p><ul><li>문구 예시: <code>2026.10.20 점심 식당 12,000원 승인</code></li><li>CSV 필수 열: <code>날짜,내역,금액</code> (선택: 구분,계좌,분류,메모)</li></ul></div><form id="pasteForm" class="form-stacked"><label>거래 텍스트<textarea name="text" rows="6" placeholder="2026.10.20 스타벅스 6,500원 승인\n2026.10.19 점심 식사 12,000원 승인"></textarea></label><label>기본 자산<select name="accountId">${optionAccounts('bank')}</select></label><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="pick-csv">CSV 파일 선택</button><button class="btn btn-primary" type="submit">문구 분석</button></div></form>`,{title:'거래 가져오기'});}
function previewImport(rows){pendingImport=rows.map(t=>({...t,accountId:t.accountId||state.accounts.find(a=>a.name===t.accountName)?.id||'bank',categoryId:t.categoryId||state.categories.find(c=>c.name===t.categoryName)?.id||suggestCategory(t.title,t.kind)}));
 let dupe=0;const examples=pendingImport.slice(0,15).map(t=>{const d=duplicateOf(t,state.transactions);if(d)dupe++;return `<div class="preview-row"><strong>${esc(t.title)}</strong><span>${esc(t.date)} · ${m(t.amount)} ${d?'<b class="pill danger">중복 후보</b>':''}</span></div>`;}).join('');
 openModal(`<div class="import-help"><p><strong>${pendingImport.length}건</strong>을 확인 필요함에 추가합니다. 중복 후보는 자동 삭제하지 않으며, 나중에 사용자가 확인할 수 있습니다.</p></div><div class="import-preview">${examples}${pendingImport.length>15?`<p>외 ${pendingImport.length-15}건...</p>`:''}</div><div class="form-actions"><button class="btn btn-secondary" data-action="open-import">뒤로</button><button class="btn btn-primary" data-action="save-import">${pendingImport.length}건 가져오기</button></div>`,{title:'가져오기 미리보기'});
}
async function fileToCsv(file){if(file.size>5000000){toast('5MB 이하의 CSV만 가져올 수 있습니다.','error');return;}try{const rows=parseCsv(await file.text());previewImport(rows);}catch(e){toast(e.message,'error');}}
function saveDownload(blob,filename){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200);}
async function exportJson(){
 try{const snapshot=activeUid?await cloud.materializeReceipts(state):structuredClone(state);
 const name=`gagyebu-backup-${isoDate()}.json`;saveDownload(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json;charset=utf-8'}),name);toast('영수증을 포함한 전체 백업 JSON을 다운로드했습니다.');}
 catch(e){toast(`완전한 백업을 만들지 못했습니다: ${e.message}`,'error');}
}
function csvEsc(val){let s=String(val??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return `"${s.replaceAll('"','""')}"`;}
function exportCsv(){const header=['날짜','내역','금액','구분','계좌','받는계좌','분류','상태','메모','계산식'];const rows=state.transactions.map(t=>[t.date,t.title,t.amount,kindLabel(t.kind),acc(t.accountId)?.name||'',acc(t.toAccountId)?.name||'',category(t.categoryId)?.name||'',t.status==='confirmed'?'확정':'확인필요',t.memo||'',t.expression||'']);
 const content='\uFEFF'+[header,...rows].map(row=>row.map(csvEsc).join(',')).join('\r\n');saveDownload(new Blob([content],{type:'text/csv;charset=utf-8'}),`gagyebu-transactions-${isoDate()}.csv`);toast('거래 CSV를 다운로드했습니다.');}
async function restoreJson(file){if(file.size>12000000){toast('12MB 이하의 JSON 파일만 복원할 수 있습니다.','error');return;}
 try{const data=JSON.parse(await file.text());validateBackup(data);if(!window.confirm(`백업 거래 ${data.transactions.length}건으로 현재 거래 ${state.transactions.length}건을 전체 교체합니다. 기존 기록을 백업하셨나요?`))return;
 if(activeUid)await mutate(s=>{Object.assign(s,structuredClone(data));},'백업을 복원하고 클라우드에 저장을 요청했습니다.');else {await saveState(data);state=data;render();toast('백업에서 복원했습니다.');}ui.month=currentPeriodMonth(state.settings.periodStartDay);closeModal();}catch(e){toast(`복원 실패: ${e.message}`,'error');}}
async function handleClick(e){const button=e.target.closest('[data-action],[data-tab],[data-filter],[data-day]');if(!button || (button.classList.contains('modal-backdrop') && e.target.closest('.dialog')))return;
 if(button.dataset.tab){ui.tab=button.dataset.tab;ui.day=null;ui.visible=80;render();window.scrollTo({top:0,behavior:'instant'});return;}
 if(button.dataset.filter){ui.filter=button.dataset.filter;ui.visible=80;render();return;}
 if(button.dataset.day){ui.day=button.dataset.day;render();return;}
 const action=button.dataset.action,tid=button.dataset.id,t=state.transactions.find(t=>t.id===tid);
 if(['login-google','login-kakao','login-naver','login-apple'].includes(action)){
  try{if(action==='login-google')await cloud.loginGoogle();else if(action==='login-apple')await cloud.loginApple();else await cloud.loginSocial(action.split('-')[1]);}
  catch(e){toast(`로그인 실패: ${e.message}`,'error');}return;
 }
 if(action==='logout'){if(localDirty&&!window.confirm('클라우드 동기화가 확인되지 않은 수정사항이 있습니다. 기기에는 보관되지만 다른 기기에 아직 없을 수 있습니다. 로그아웃할까요?'))return;try{await cloud.logout();toast('로그아웃했습니다. 비로그인 장부로 전환되었습니다.');}catch(e){toast(e.message,'error');}return;}
 if(action==='merge-guest'){
  if(!activeUid||!cloudReady)return toast('로그인과 클라우드 준비를 확인해 주세요.','error');
  const guest=await loadState(),result=mergeGuestLedger(state,guest,id);
  if(!result.imported && result.ledger.accounts.length===state.accounts.length && result.ledger.categories.length===state.categories.length)return toast('가져올 기기 기록이 없습니다.');
  if(!window.confirm(`기기 비로그인 장부의 거래 ${result.imported}건과 관련 자산/분류를 현재 클라우드 장부에 추가할까요? 기존 클라우드 장부는 유지되고, 기기 원본도 남습니다.`))return;
  await mutate(s=>Object.assign(s,result.ledger),`기기 거래 ${result.imported}건을 클라우드에 등록 요청했습니다.`);return;
 }
 if(action==='retry-sync'){
  if(!activeUid||!cloudReady||cloud.pending)return toast('클라우드 연결이 준비되거나 이전 저장이 끝날 때까지 기다려 주세요.','error');
  if(!latestRemote)return toast('최신 클라우드 기록을 아직 확인하지 못했습니다. 잠시 후 다시 시도하세요.','error');
  const baseline=await loadUserSynced(activeUid)||initialState();
  const reconciled=rebaseOfflineChanges(baseline,state,latestRemote);
  if(reconciled.conflicts.length){
    toast(`다른 기기와 변경사항 ${reconciled.conflicts.length}건이 충돌합니다. JSON 전체 백업 후 각각의 기록을 확인하세요. 자동 덮어쓰기는 차단했습니다.`,'error');
    return;
  }
  const remoteBefore=structuredClone(latestRemote);
  state=reconciled.ledger;
  await saveUserState(activeUid,state,{dirty:true});localDirty=true;render();
  toast('서로 다른 기기의 변경사항을 합쳐 클라우드 재전송을 요청했습니다.');
  cloud.queueDiff(remoteBefore,structuredClone(state),{retry:true}).catch(e=>toast(`재전송 실패: ${e.message}`,'error'));
  return;
 }
 if(action==='dismiss-modal'){closeModal();return;}
 if(action==='prev-month'||action==='next-month'){ui.month=shiftMonth(ui.month,action==='prev-month'?-1:1);ui.day=null;render();return;}
 if(action==='add-transaction'){openTransaction();return;}
 if(action==='add-on-selected-day'){openTransaction(null,{date:ui.day});return;}
 if(action==='edit-transaction'&&t){openTransaction(t);return;}
 if(action==='refund-transaction'&&t){openTransaction(null,{kind:'refund',title:`${t.title} 환불`,amount:t.amount,accountId:t.accountId,categoryId:t.categoryId,refundOf:t.id});return;}
 if(action==='confirm-transaction'&&t){if(['transfer','repayment'].includes(t.kind)&&(!t.toAccountId||t.toAccountId===t.accountId)){openTransaction(t);toast('확정 전에 받는 계좌를 지정해주세요.','error');return;}const duplicate=duplicateOf(t,state.transactions);if(duplicate&&!window.confirm('비슷한 거래가 이미 있습니다. 그래도 확정할까요?'))return;
 await mutate(s=>{const item=s.transactions.find(x=>x.id===tid);item.status='confirmed';item.updatedAt=new Date().toISOString();},'거래를 확정했습니다.');return;}
 if(action==='delete-transaction'&&t){if(!window.confirm(`“${t.title}” ${m(t.amount)} 거래를 삭제할까요?`))return;await mutate(s=>{s.transactions=s.transactions.filter(x=>x.id!==tid);s.events.push({id:id(),entityId:tid,action:'delete',createdAt:new Date().toISOString()});},'거래를 삭제했습니다.');return;}
 if(action==='view-pending'){ui.tab='transactions';ui.filter='pending';render();return;}
 if(action==='show-more'){ui.visible+=100;render();return;}
 if(action==='add-account'){openAccount();return;}
 if(action==='edit-account'){openAccount(acc(tid));return;}
 if(action==='delete-account'){if(!window.confirm('이 자산을 삭제할까요?'))return;closeModal();await mutate(s=>{s.accounts=s.accounts.filter(a=>a.id!==tid);},'자산을 삭제했습니다.');return;}
 if(action==='new-transfer'){openTransaction(null,{kind:'transfer',accountId:'cash',toAccountId:'bank'});return;}
 if(action==='new-repayment'){const bank=state.accounts.find(a=>a.kind==='bank')||state.accounts.find(a=>a.kind==='cash'),card=state.accounts.find(a=>a.kind==='card');if(!card){toast('먼저 신용카드 자산을 추가해주세요.','error');return;}openTransaction(null,{kind:'repayment',accountId:bank?.id,toAccountId:card.id,title:'카드대금 상환'});return;}
 if(action==='add-category'){openCategory();return;}
 if(action==='edit-category'){openCategory(category(tid));return;}
 if(action==='budget-category'){openBudget(tid);return;}
 if(action==='open-import'){openImport();return;}
 if(action==='pick-csv'){$('#csvInput').click();return;}
 if(action==='save-import'){const toAdd=structuredClone(pendingImport);if(!toAdd.length)return;closeModal();await mutate(s=>{s.transactions.push(...toAdd);},`${toAdd.length}건을 확인 필요함에 추가했습니다.`);pendingImport=[];ui.tab='transactions';ui.filter='pending';render();return;}
 if(action==='export-csv'){exportCsv();return;}
 if(action==='export-json'){await exportJson();return;}
 if(action==='import-json'){$('#jsonInput').click();return;}
 if(action==='remove-photo'){if(modalContext){modalContext.attachment=null;modalContext.attachmentPath=null;}button.closest('.attached-image')?.remove();toast('저장하면 첨부사진이 제거됩니다.');return;}
 if(action==='load-demo'){if(state.transactions.length>0){toast('샘플은 빈 장부에서만 불러올 수 있습니다.','error');return;}await mutate(s=>{const demo=createDemoState();s.transactions=demo.transactions;s.accounts=demo.accounts;s.categories=demo.categories;s.settings=demo.settings;},'체험용 데이터를 불러왔습니다.');return;}
 if(action==='reset-all'){
  if(!window.confirm(`현재 ${activeUid?'클라우드와 기기':'기기'} 장부의 모든 거래·자산·분류·설정을 초기화합니다. JSON 백업을 먼저 권장합니다. 계속할까요?`))return;
  if(!window.confirm('삭제한 데이터는 복구하기 어렵습니다. 정말 초기화할까요?'))return;
  if(activeUid)await mutate(s=>Object.assign(s,initialState()),'클라우드 장부 초기화를 요청했습니다.');
  else {await saveState(initialState());state=initialState();toast('로컬 장부를 초기화했습니다.');}
  ui.month=currentPeriodMonth(1);ui.tab='home';render();return;
 }
}
async function handleSubmit(e){if(e.target.id==='transactionForm')return saveTransaction(e);if(e.target.id==='accountForm')return saveAccount(e);if(e.target.id==='categoryForm')return saveCategory(e);
 if(e.target.id==='budgetForm'){e.preventDefault();const v=Number(e.target.elements.amount.value),catId=modalContext?.categoryId;if(!Number.isSafeInteger(v)||v<0)return toast('0원 이상의 예산을 입력하세요.','error');closeModal();await mutate(s=>{s.budgets[catId]=v;},'분류 예산을 적용했습니다.');return;}
 if(e.target.id==='settingsForm'){e.preventDefault();const f=e.target;const monthlyBudget=Number(f.elements.monthlyBudget.value),periodStartDay=Number(f.elements.periodStartDay.value),theme=f.elements.theme.value;if(!Number.isSafeInteger(monthlyBudget)||monthlyBudget<0)return toast('예산 금액을 확인해주세요.','error');await mutate(s=>{Object.assign(s.settings,{monthlyBudget,periodStartDay,theme});},'설정을 저장했습니다.');return;}
 if(e.target.id==='pasteForm'){e.preventDefault();const f=e.target;const rows=parsePastedLines(f.elements.text.value,f.elements.accountId.value);if(!rows.length){toast('금액이 포함된 거래 문구를 찾지 못했습니다.','error');return;}previewImport(rows);return;}
}
let searchTimer;
function handleInput(e){
 if(e.target.id==='searchInput'){ui.query=e.target.value;clearTimeout(searchTimer);const cursor=e.target.selectionStart;searchTimer=setTimeout(()=>{render();const input=$('#searchInput');if(input){input.focus();input.setSelectionRange(cursor,cursor);}},240);}
 if(e.target.closest('#transactionForm')&&e.target.name==='expression')updateCalcPreview();
 if(e.target.closest('#transactionForm')&&e.target.name==='title'){const f=$('#transactionForm');const kind=f.querySelector('[name="kind"]:checked')?.value;const c=f.elements.namedItem('categoryId');const suggested=suggestCategory(e.target.value,kind);if((kind==='expense'||kind==='income')&&(c.value==='other-expense'||c.value==='other-income')&&suggested!==c.value)c.value=suggested;}
}
function handleChange(e){if(e.target.closest('#transactionForm')&&e.target.name==='kind')updateTransactionKind();
 if(e.target.id==='kindFilter'){ui.kindFilter=e.target.value;ui.visible=80;render();}
 if(e.target.id==='accountFilter'){ui.accountFilter=e.target.value;ui.visible=80;render();}
 if(e.target.id==='categoryFilter'){ui.categoryFilter=e.target.value;ui.visible=80;render();}
}
async function boot(){
 initAds(); // SOFTM-ADFIT 날짜:20261022 : 렌더링마다 SDK를 다시 불러오지 않도록 한 번 초기화
 try{state=await loadState();validateBackup(state);ui.month=currentPeriodMonth(state.settings.periodStartDay);render();}
 catch(e){$('#page').innerHTML=`<div class="boot-error"><h1>저장소를 열 수 없습니다</h1><p>${esc(e.message)}</p><p>브라우저의 사이트 데이터 저장 허용 여부를 확인하거나 일반 창에서 다시 시도하세요.</p></div>`;return;}
 document.addEventListener('click',handleClick);document.addEventListener('submit',handleSubmit);document.addEventListener('input',handleInput);document.addEventListener('change',handleChange);
 $('#csvInput').addEventListener('change',async e=>{if(e.target.files[0])await fileToCsv(e.target.files[0]);e.target.value='';});
 $('#jsonInput').addEventListener('change',async e=>{if(e.target.files[0])await restoreJson(e.target.files[0]);e.target.value='';});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modalHost').innerHTML){closeModal();return;}if(e.key.toLowerCase()==='n'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!$('#modalHost').innerHTML&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();openTransaction();}});
 // SOFTM-PWA-SCOPE 날짜:20261022 : Pages 하위 경로의 PWA가 사이트 루트 범위를 요청해 등록 실패하지 않게 함
 if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname}).catch(err=>console.warn('PWA 등록 실패',err));
 cloud.start().catch(err=>toast(`클라우드 연결 실패: ${err.message}`,'error'));
}
boot();

