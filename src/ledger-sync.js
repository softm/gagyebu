import {initialState, validateBackup} from './domain.js';

/** Pure conversion and migration utilities. No Firebase / DOM dependencies. */
export const COLLECTIONS=['accounts','categories','transactions'];
export const CLIENT_ONLY_FIELDS=['attachment'];

export function forCloudDocument(record){
  const copy=structuredClone(record);
  for(const key of CLIENT_ONLY_FIELDS)delete copy[key];
  return JSON.parse(JSON.stringify(copy)); // no undefined values in Firestore
}

export function changedDocuments(before,after){
  validateBackup(before);validateBackup(after);
  const changes=[];
  for(const collection of COLLECTIONS){
    const previous=new Map(before[collection].map(item=>[item.id,forCloudDocument(item)]));
    for(const item of after[collection]){
      const value=forCloudDocument(item);
      if(JSON.stringify(previous.get(item.id))!==JSON.stringify(value))changes.push({collection,action:'set',id:item.id,data:value});
      previous.delete(item.id);
    }
    for(const id of previous.keys())changes.push({collection,action:'delete',id});
  }
  const beforeMeta={settings:before.settings,budgets:before.budgets,events:before.events||[]};
  const afterMeta={settings:after.settings,budgets:after.budgets,events:after.events||[]};
  if(JSON.stringify(beforeMeta)!==JSON.stringify(afterMeta))changes.push({collection:'ledger',action:'set',id:'config',data:{version:1,...afterMeta,initialized:true}});
  return changes;
}

export function reconstructLedger(meta,groups){
  const state=initialState();
  if(meta){
    if(meta.version!==1)throw new Error('지원하지 않는 클라우드 가계부 버전입니다.');
    state.settings={...state.settings,...meta.settings};
    state.budgets=meta.budgets||{};
    state.events=meta.events||[];
  }
  for(const collection of COLLECTIONS)state[collection]=groups[collection]??[];
  validateBackup(state);
  return state;
}

/**
 * Import into a signed-in user's ledger with new identifiers for conflicting records.
 * Default account/category IDs are shared without overwriting remote customizations.
 * Never merges based on email or automatically replaces cloud data.
 */
export function mergeGuestLedger(remote,guest,newId=()=>crypto.randomUUID()){
  validateBackup(remote);validateBackup(guest);
  const result=structuredClone(remote), mapping={accounts:new Map(),categories:new Map()};
  for(const collection of ['accounts','categories']){
    const existing=new Map(result[collection].map(v=>[v.id,v]));
    for(const record of guest[collection]){
      let nextId=record.id;
      if(existing.has(nextId)){
        // Reuse identical default accounts/categories, but preserve distinct opening
        // balances / customized names by adding a renamed imported record.
        if(JSON.stringify(existing.get(nextId))===JSON.stringify(record)){
          mapping[collection].set(record.id,nextId);continue;
        }
        nextId=newId();
      }
      const copy={...structuredClone(record),id:nextId};
      if(nextId!==record.id)copy.name=`${copy.name} (기기 가져옴)`.slice(0,32);
      result[collection].push(copy);existing.set(nextId,copy);mapping[collection].set(record.id,nextId);
    }
  }
  const transactionIds=new Set(result.transactions.map(t=>t.id));
  const importedMap=new Map();
  let imported=0,skipped=0;
  // Assign IDs first so refundOf can follow renamed transactions.
  for(const t of guest.transactions){
    let nextId=t.id;
    if(transactionIds.has(nextId)){
      const old=result.transactions.find(x=>x.id===nextId);
      if(JSON.stringify(old)===JSON.stringify(t)){skipped++;continue;}
      nextId=newId();
    }
    importedMap.set(t.id,nextId);transactionIds.add(nextId);
  }
  for(const t of guest.transactions){
    if(!importedMap.has(t.id))continue;
    const clone=structuredClone(t);
    clone.id=importedMap.get(t.id);
    clone.accountId=mapping.accounts.get(clone.accountId)||clone.accountId;
    if(clone.toAccountId)clone.toAccountId=mapping.accounts.get(clone.toAccountId)||clone.toAccountId;
    if(clone.categoryId)clone.categoryId=mapping.categories.get(clone.categoryId)||clone.categoryId;
    if(clone.refundOf)clone.refundOf=importedMap.get(clone.refundOf)||clone.refundOf;
    result.transactions.push(clone);imported++;
  }
  // Remote settings, budgets and events are deliberately unchanged.
  validateBackup(result);
  return {ledger:result,imported,skipped};
}