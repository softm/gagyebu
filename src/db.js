import {initialState,validateBackup} from './domain.js';
const DB_NAME='gagyebu-local-v1', STORE='ledger';
let dbPromise;
function open(){
 if(!('indexedDB' in window))return Promise.reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'));
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('저장소 연결 실패'));
 });return dbPromise;
}
export async function loadState(){const db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get('main');req.onsuccess=()=>resolve(req.result||initialState());req.onerror=()=>reject(req.error);
});}
export async function saveState(state){validateBackup(state);const db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,'main');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('저장 실패'));tx.onabort=()=>reject(tx.error||new Error('저장 취소'));
});}
