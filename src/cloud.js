/**
 * Firebase auth + per-user Firestore realtime sync for the static GitHub Pages app.
 * The Firebase SDK is loaded only if the project has been configured.
 * Secrets / external OAuth token exchanges are NEVER performed in the browser.
 */
import {firebaseConfig,socialConfig,cloudRegion} from './firebase-config.js';
import {initialState} from './domain.js';
import {changedDocuments,reconstructLedger,forCloudDocument} from './ledger-sync.js';

const SDK='12.4.0';
const oauthKey='gagyebu:oauth';
const timeoutMinutes=10;
const validConfig=()=>['apiKey','authDomain','projectId','appId'].every(key=>Boolean(firebaseConfig[key]?.trim()));
const dataUrlPattern=/^data:image\/(?:png|jpeg|webp);base64,/i;
const normalizeError=(error)=>{
  const code=String(error?.code||'');
  const names={
    'auth/unauthorized-domain':'Firebase 인증 허용 도메인에 이 웹사이트가 등록되지 않았습니다.',
    'auth/popup-blocked':'팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.',
    'auth/popup-closed-by-user':'로그인 창이 닫혔습니다.',
    'auth/account-exists-with-different-credential':'이미 다른 로그인 방법으로 등록된 이메일입니다. 기존 방법으로 로그인해 주세요.',
    'permission-denied':'Firestore 보안 규칙에서 접근을 거부했습니다. UID 규칙을 확인해 주세요.',
    'functions/not-found':'SNS 로그인용 Cloud Functions가 아직 배포되지 않았습니다.',
    'unavailable':'네트워크가 끊겼습니다. 로컬 기록을 보존하며 다시 연결되면 동기화합니다.'
  };
  return names[code]||names[code.replace(/^firestore\//,'')]||error?.message||'클라우드 작업을 완료하지 못했습니다.';
};
const redirectUri=()=>new URL('./',window.location.href).toString();
const isReceiptPath=(uid,path)=>typeof path==='string'&&path.startsWith(`users/${uid}/receipts/`)&&path.length<240;

export class CloudService{
  constructor(handlers={}){
    this.handlers=handlers;this.sdk=null;this.app=null;this.auth=null;this.db=null;this.storage=null;
    this.user=null;this.started=false;this.ready=false;this.pending=0;this.queue=Promise.resolve();this.syncBlocked=false;
    this.unsubscribe=[];this.parts={};this.epoch=0;this.lastRemote=null;this.lastError='';
  }
  isConfigured(){return validConfig();}
  getUid(){return this.user?.uid||null;}
  _status(kind,detail=''){this.handlers.onStatus?.(kind,detail);}
  _error(e){this.lastError=normalizeError(e);this._status('error',this.lastError);this.handlers.onError?.(this.lastError);}
  async start(){
    if(this.started)return;this.started=true;
    if(!validConfig()){this._status('unconfigured');return;}
    try{
      const base=`https://www.gstatic.com/firebasejs/${SDK}`;
      const [app,auth,firestore,functions,storage]=await Promise.all([
        import(`${base}/firebase-app.js`),import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-firestore.js`),import(`${base}/firebase-functions.js`),
        import(`${base}/firebase-storage.js`)
      ]);
      this.sdk={app,auth,firestore,functions,storage};
      this.app=app.initializeApp(firebaseConfig);
      this.auth=auth.getAuth(this.app);
      try{await auth.setPersistence(this.auth,auth.browserLocalPersistence);}catch(e){console.warn('로그인 지속 설정:',e?.code||e);}
      try{
        this.db=firestore.initializeFirestore(this.app,{localCache:firestore.persistentLocalCache({tabManager:firestore.persistentMultipleTabManager()})});
      }catch{this.db=firestore.getFirestore(this.app);}
      if(firebaseConfig.storageBucket)this.storage=storage.getStorage(this.app);
      this.functions=functions.getFunctions(this.app,cloudRegion);
      this._status('signedout');
      this._authUnsub=auth.onAuthStateChanged(this.auth,user=>{
        this._onUser(user).catch(e=>this._error(e));
      },e=>this._error(e));
      await this.consumeOAuthRedirect();
    }catch(e){this._error(e);}
  }
  async _onUser(user){
    const epoch=++this.epoch;
    this.unsubscribe.forEach(fn=>fn());this.unsubscribe=[];this.parts={};this.lastRemote=null;
    this.user=user;this.ready=false;this.pending=0;this.queue=Promise.resolve();this.syncBlocked=false;
    await this.handlers.onAuth?.(user);
    if(!user){this._status('signedout');return;}
    this._status('loading');
    const {firestore:f}=this.sdk;
    const configRef=f.doc(this.db,'users',user.uid,'ledger','config');
    let meta;
    try{meta=await f.getDoc(configRef);}catch(e){if(epoch===this.epoch)this._error(e);return;}
    if(epoch!==this.epoch)return;
    if(!meta.exists()){
      const fresh=initialState();const batch=f.writeBatch(this.db);
      batch.set(configRef,{version:1,settings:fresh.settings,budgets:{},events:[],initialized:true,updatedAt:f.serverTimestamp()});
      for(const coll of ['accounts','categories'])for(const item of fresh[coll]){
        batch.set(f.doc(this.db,'users',user.uid,coll,item.id),forCloudDocument(item));
      }
      await batch.commit();
      if(epoch!==this.epoch)return;
    }
    this._watch(epoch,user.uid);
  }
  _watch(epoch,uid){
    const {firestore:f}=this.sdk;
    const watch=(collection,reference,select)=>{
      const unsubscribe=f.onSnapshot(reference,snapshot=>{
        if(epoch!==this.epoch)return;
        this.parts[collection]=select(snapshot);
        if(['ledger','accounts','categories','transactions'].every(k=>Object.hasOwn(this.parts,k)))this._emitRemote(epoch);
      },e=>this._error(e));
      this.unsubscribe.push(unsubscribe);
    };
    watch('ledger',f.doc(this.db,'users',uid,'ledger','config'),s=>s.exists()?s.data():null);
    for(const name of ['accounts','categories','transactions']){
      watch(name,f.collection(this.db,'users',uid,name),s=>s.docs.map(d=>({...d.data(),id:d.id})));
    }
  }
  _emitRemote(epoch){
    if(epoch!==this.epoch)return;
    try{
      const s=reconstructLedger(this.parts.ledger,this.parts);
      this.lastRemote=s;this.ready=true;
      // While local edits are queued, do not replace them with intermediate snapshots.
      if(this.pending){this._status('saving');return;}
      this._status('synced');this.handlers.onLedger?.(s);
    }catch(e){this._error(e);}
  }
  async loginGoogle(){
    if(!this.auth)throw new Error('Firebase 설정이 필요합니다. 설정 안내를 확인하세요.');
    const {auth:a}=this.sdk;
    try{await a.signInWithPopup(this.auth,new a.GoogleAuthProvider());}
    catch(e){
      if(e?.code==='auth/popup-blocked')await a.signInWithRedirect(this.auth,new a.GoogleAuthProvider());
      else throw new Error(normalizeError(e));
    }
  }
  async loginApple(){
    if(!this.auth)throw new Error('Firebase 설정이 필요합니다.');
    const {auth:a}=this.sdk,provider=new a.OAuthProvider('apple.com');
    try{await a.signInWithPopup(this.auth,provider);}
    catch(e){if(e?.code==='auth/popup-blocked')await a.signInWithRedirect(this.auth,provider);else throw new Error(normalizeError(e));}
  }
  async loginSocial(provider){
    if(!this.auth)throw new Error('Firebase 설정을 먼저 완료해 주세요.');
    const key=provider==='kakao'?socialConfig.kakaoRestApiKey:provider==='naver'?socialConfig.naverClientId:'';
    if(!key)throw new Error(`${provider==='kakao'?'카카오':'네이버'} 로그인 앱 키를 설정해야 합니다.`);
    const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
    const redirect=redirectUri();
    sessionStorage.setItem(oauthKey,JSON.stringify({provider,state,redirect,at:Date.now()}));
    const url=new URL(provider==='kakao'?'https://kauth.kakao.com/oauth/authorize':'https://nid.naver.com/oauth2.0/authorize');
    url.searchParams.set('response_type','code');url.searchParams.set('client_id',key);
    url.searchParams.set('redirect_uri',redirect);url.searchParams.set('state',state);
    window.location.assign(url.toString());
  }
  async consumeOAuthRedirect(){
    const url=new URL(window.location.href);
    const code=url.searchParams.get('code'),returnedState=url.searchParams.get('state'),error=url.searchParams.get('error');
    if(!code&&!error)return;
    // Remove the one-use authorization code from browser history immediately.
    for(const key of ['code','state','error','error_description'])url.searchParams.delete(key);
    window.history.replaceState({},'',url.toString());
    const raw=sessionStorage.getItem(oauthKey);sessionStorage.removeItem(oauthKey);
    if(!raw)throw new Error('로그인 상태를 확인할 수 없습니다. 다시 시도해 주세요.');
    let flow;try{flow=JSON.parse(raw);}catch{throw new Error('로그인 인증 정보가 올바르지 않습니다.');}
    if(!['kakao','naver'].includes(flow.provider)||!flow.state||flow.state!==returnedState||flow.redirect!==redirectUri()||Date.now()-flow.at>timeoutMinutes*60000){
      throw new Error('로그인 요청이 만료되었거나 일치하지 않습니다. 다시 시도해 주세요.');
    }
    if(error)throw new Error('SNS 로그인이 취소되었거나 거절되었습니다.');
    const fn=this.sdk.functions.httpsCallable(this.functions,'oauthExchange');
    const response=await fn({provider:flow.provider,code,redirectUri:flow.redirect,state:flow.state});
    if(!response.data?.token)throw new Error('인증 서버에서 로그인 토큰을 받지 못했습니다.');
    const credential=await this.sdk.auth.signInWithCustomToken(this.auth,response.data.token);
    if(response.data.displayName&&!credential.user.displayName){
      try{await this.sdk.auth.updateProfile(credential.user,{displayName:response.data.displayName.slice(0,80)});}catch{}
    }
  }
  async logout(){if(this.auth)await this.sdk.auth.signOut(this.auth);}
  async getReceipt(path){
    if(!this.user||!isReceiptPath(this.user.uid,path)||!this.storage)throw new Error('영수증 저장소에 접근할 수 없습니다.');
    const {storage:s}=this.sdk;
    const blob=await s.getBlob(s.ref(this.storage,path));
    return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('영수증 파일 읽기 실패'));r.readAsDataURL(blob);});
  }
  async materializeReceipts(ledger){
    const copy=structuredClone(ledger);
    for(const tx of copy.transactions){
      if(tx.attachmentPath&&!tx.attachment)tx.attachment=await this.getReceipt(tx.attachmentPath);
    }
    return copy;
  }
  /** Caller saves user-specific IndexedDB copy FIRST, then invokes this async queue. */
  queueDiff(before,after,{retry=false}={}){
    if(retry)this.syncBlocked=false;
    const uid=this.user?.uid,epoch=this.epoch;
    if(!uid||!this.ready)return Promise.reject(new Error('아직 클라우드 장부를 불러오지 못했습니다.'));
    this.pending++;this._status('saving');
    const work=async()=>{
      if(uid!==this.user?.uid||epoch!==this.epoch)return;
      if(this.syncBlocked)throw new Error('이전 동기화 오류로 업로드가 중지되었습니다. 설정에서 재전송하세요.');
      return this._writeDiff(uid,before,after);
    };
    const next=this.queue.catch(()=>{}).then(work);
    this.queue=next;
    return next.then(updated=>{
      if(epoch!==this.epoch)return;
      this.pending--;if(!this.pending){this._status('synced');this.handlers.onSynchronized?.(updated);}
    },e=>{if(epoch===this.epoch){this.pending--;this.syncBlocked=true;this._error(e);}throw e;});
  }
  async _writeDiff(uid,before,after){
    const {firestore:f,storage:s}=this.sdk;
    const updated=structuredClone(after);
    const previous=new Map(before.transactions.map(t=>[t.id,t]));
    const removePaths=[];
    for(const tx of updated.transactions){
      const prev=previous.get(tx.id);
      if(prev?.attachmentPath&&!tx.attachmentPath)removePaths.push(prev.attachmentPath);
      if(tx.attachment&&dataUrlPattern.test(tx.attachment)&&(!tx.attachmentPath||(prev?.attachment&&prev.attachment!==tx.attachment))){
        if(!this.storage)throw new Error('영수증 클라우드 저장에는 Firebase Storage 버킷이 필요합니다.');
        const path=`users/${uid}/receipts/${crypto.randomUUID()}`;
        await s.uploadString(s.ref(this.storage,path),tx.attachment,'data_url',{contentType:tx.attachment.slice(5,tx.attachment.indexOf(';'))});
        tx.attachmentPath=path;
        if(prev?.attachmentPath&&!removePaths.includes(prev.attachmentPath))removePaths.push(prev.attachmentPath);
      }
    }
    const afterIds=new Set(updated.transactions.map(t=>t.id));
    for(const item of before.transactions)if(!afterIds.has(item.id)&&item.attachmentPath)removePaths.push(item.attachmentPath);
    const changes=changedDocuments(before,updated);
    for(let pos=0;pos<changes.length;pos+=350){
      const batch=f.writeBatch(this.db);
      for(const item of changes.slice(pos,pos+350)){
        const target=f.doc(this.db,'users',uid,item.collection,item.id);
        if(item.action==='set')batch.set(target,item.data);
        else batch.delete(target);
      }
      await batch.commit();
    }
    // Storage objects are deleted only after the Firestore references are removed.
    for(const path of removePaths){if(this.storage&&isReceiptPath(uid,path)){
      try{await s.deleteObject(s.ref(this.storage,path));}catch(e){console.warn('영수증 정리 지연',e?.code||e);}
    }}
    return updated;
  }
  stop(){this.epoch++;this.unsubscribe.forEach(fn=>fn());this.unsubscribe=[];this._authUnsub?.();}
}
export {normalizeError};
