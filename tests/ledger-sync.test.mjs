import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/domain.js';
import {
  changedDocuments,reconstructLedger,forCloudDocument,mergeGuestLedger,
  prepareLedgerMutation,rebaseOfflineChanges,rebaseQueuedMutation,resolveLedgerConflicts
} from '../src/ledger-sync.js';

const makeTx=(id,accountId='bank')=>({id,kind:'expense',date:'2026-10-20',title:'커피',amount:5600,status:'confirmed',accountId,categoryId:'cafe',createdAt:'2026-10-20T10:00:00Z'});
const event=(id)=>({id,entityType:'transaction',entityId:id,action:'create',actorUid:'u1',deviceId:'d1',createdAt:'2026-10-20T10:00:00Z',changedFields:['title'],before:null,after:{title:'커피'}});

test('Only changed transaction is written, never replaces the entire ledger',()=>{
 const a=initialState();a.transactions.push({...makeTx('t1'),revision:1},{...makeTx('t2'),revision:1});
 const draft=structuredClone(a);draft.transactions[0].title='커피 수정';
 const b=prepareLedgerMutation(a,draft,{now:'2026-10-20T11:00:00Z',actorUid:'u1',deviceId:'d1',idFactory:()=>`e1`});
 const diff=changedDocuments(a,b);
 assert.equal(diff.filter(x=>x.collection==='transactions').length,1);
 assert.equal(diff.find(x=>x.collection==='transactions').data.revision,2);
 assert.ok(diff.some(x=>x.collection==='events'&&x.id==='e1'));
});

test('Deletes become revisioned tombstones and metadata changes stay independent',()=>{
 const a=initialState();a.transactions.push({...makeTx('t1'),revision:3});
 const draft=structuredClone(a);draft.transactions=[];draft.budgets.food=150000;
 const b=prepareLedgerMutation(a,draft,{now:'2026-10-20T11:00:00Z',idFactory:(()=>{let i=0;return()=>`e${++i}`;})()});
 const diff=changedDocuments(a,b,{now:'2026-10-20T11:00:00Z'});
 const tombstone=diff.find(d=>d.collection==='transactions'&&d.id==='t1');
 assert.equal(tombstone.action,'set');assert.equal(tombstone.data.deleted,true);assert.equal(tombstone.data.revision,4);
 const config=diff.find(d=>d.collection==='ledger');assert.equal(config.data.budgets.food,150000);assert.equal(config.data.events,undefined);
});

test('Receipt image is never embedded in Firestore transaction document',()=>{
 const tx={...makeTx('t1'),attachment:'data:image/png;base64,ABCD',attachmentUploadId:'123e4567-e89b-12d3-a456-426614174000',attachmentPath:'users/u1/receipts/a'};
 const cleaned=forCloudDocument(tx);assert.equal(cleaned.attachment,undefined);assert.equal(cleaned.attachmentUploadId,undefined);assert.equal(cleaned.attachmentPath,'users/u1/receipts/a');
});

test('A receipt-only local edit still advances the transaction revision',()=>{
 const before=initialState();before.transactions.push({...makeTx('t1'),revision:4,attachment:null,attachmentPath:null});
 const draft=structuredClone(before);draft.transactions[0].attachment='data:image/png;base64,ABCD';
 const after=prepareLedgerMutation(before,draft,{now:'2026-10-20T11:00:00Z',idFactory:()=>`receipt-event`});
 assert.equal(after.transactions[0].revision,5);assert.equal(after.events.at(-1).id,'receipt-event');
});

test('A later queued edit keeps the receipt path assigned by the preceding write',()=>{
 const remote=initialState(),firstDraft=structuredClone(remote);firstDraft.transactions.push({...makeTx('t1'),attachment:'data:image/png;base64,ABCD',attachmentPath:null});
 const firstLocal=prepareLedgerMutation(remote,firstDraft,{now:'2026-10-20T11:00:00Z',idFactory:()=>`first-event`});
 const secondDraft=structuredClone(firstLocal);secondDraft.transactions[0].title='영수증과 함께 수정';
 const secondLocal=prepareLedgerMutation(firstLocal,secondDraft,{now:'2026-10-20T11:01:00Z',idFactory:()=>`second-event`});
 const acknowledged=structuredClone(firstLocal);acknowledged.transactions[0].attachmentPath='users/u1/receipts/123e4567-e89b-12d3-a456-426614174000';
 const rebased=rebaseQueuedMutation(firstLocal,secondLocal,acknowledged);
 assert.deepEqual(rebased.conflicts,[]);assert.equal(rebased.ledger.transactions[0].title,'영수증과 함께 수정');
 assert.equal(rebased.ledger.transactions[0].attachmentPath,acknowledged.transactions[0].attachmentPath);
 assert.equal(rebased.ledger.transactions[0].attachmentUploadId,firstLocal.transactions[0].attachmentUploadId);
});

test('An acknowledged receipt write is not reported as a conflict after an ambiguous response',()=>{
 const baseline=initialState(),draft=structuredClone(baseline);draft.transactions.push({...makeTx('t1'),attachment:'data:image/png;base64,ABCD',attachmentPath:null});
 const local=prepareLedgerMutation(baseline,draft,{now:'2026-10-20T11:00:00Z',idFactory:()=>`receipt-commit-event`});
 const server=structuredClone(local),serverTransaction=forCloudDocument(server.transactions[0]);
 serverTransaction.attachmentPath=`users/u1/receipts/${local.transactions[0].attachmentUploadId}`;server.transactions=[serverTransaction];
 const rebased=rebaseOfflineChanges(baseline,local,server);
 assert.deepEqual(rebased.conflicts,[]);assert.equal(rebased.ledger.transactions[0].attachmentPath,serverTransaction.attachmentPath);
});

test('Rebuild reads separate events and hides tombstones',()=>{
 const base=initialState();const out=reconstructLedger({version:1,schemaVersion:2,settings:base.settings,budgets:{food:1234},revision:4},{
  accounts:base.accounts,categories:base.categories,transactions:[makeTx('xyz'),{id:'gone',deleted:true,revision:2,createdAt:'2026-10-20T09:00:00Z',updatedAt:'2026-10-20T10:00:00Z'}],events:[event('event-1')]
 });
 assert.equal(out.transactions.length,1);assert.equal(out.tombstones.transactions.gone.revision,2);assert.equal(out.budgets.food,1234);assert.equal(out.events.length,1);assert.equal(out.metaRevision,4);
});

test('A deliberate resurrection advances the remembered tombstone revision',()=>{
 const remote=initialState();remote.tombstones.transactions.gone={id:'gone',deleted:true,revision:4,createdAt:'2026-10-20T09:00:00Z',updatedAt:'2026-10-20T10:00:00Z'};
 const draft=structuredClone(remote);draft.transactions.push(makeTx('gone'));
 const next=prepareLedgerMutation(remote,draft,{now:'2026-10-20T11:00:00Z',idFactory:()=>`resurrect-event`});
 const change=changedDocuments(remote,next).find(item=>item.collection==='transactions'&&item.id==='gone');
 assert.equal(next.transactions[0].revision,5);assert.equal(next.tombstones.transactions.gone,undefined);
 assert.equal(change.expectedExists,true);assert.equal(change.expectedRevision,4);assert.equal(change.data.revision,5);
});

test('One thousand events produce separate documents, never a config array',()=>{
 const a=initialState(),b=structuredClone(a);b.events=Array.from({length:1000},(_,i)=>event(`event-${i}`));
 const diff=changedDocuments(a,b);
 assert.equal(diff.filter(change=>change.collection==='events').length,1000);
 assert.equal(diff.some(change=>change.collection==='ledger'),false);
});

test('Import keeps cloud opening balances and remaps references',()=>{
 const cloud=initialState();cloud.accounts.find(a=>a.id==='bank').openingBalance=10000;
 const guest=initialState();guest.accounts.find(a=>a.id==='bank').openingBalance=60000;guest.transactions.push(makeTx('guest-t','bank'));
 let i=0;const {ledger,summary}=mergeGuestLedger(cloud,guest,()=>`new-${++i}`);
 assert.equal(summary.transactions,1);const importedTx=ledger.transactions[0];assert.notEqual(importedTx.accountId,'bank');
 assert.equal(ledger.accounts.find(a=>a.id===importedTx.accountId).openingBalance,60000);
 assert.equal(ledger.accounts.find(a=>a.id==='bank').openingBalance,10000);
});

test('Import reuses equivalent defaults even after cloud timestamps were added',()=>{
 const cloud=initialState();
 cloud.accounts=cloud.accounts.map(item=>({...item,revision:1,createdAt:'2026-10-20T09:00:00Z',updatedAt:'2026-10-20T09:00:00Z'}));
 cloud.categories=cloud.categories.map(item=>({...item,revision:1,createdAt:'2026-10-20T09:00:00Z',updatedAt:'2026-10-20T09:00:00Z'}));
 const guest=initialState();
 const before={accounts:cloud.accounts.length,categories:cloud.categories.length};
 const {ledger,summary}=mergeGuestLedger(cloud,guest,()=>{throw new Error('새 ID를 만들면 안 됩니다.');});
 assert.equal(ledger.accounts.length,before.accounts);assert.equal(ledger.categories.length,before.categories);
 assert.equal(summary.accounts,0);assert.equal(summary.categories,0);
});

test('Repeated guest import is idempotent even after an ID collision',()=>{
 const cloud=initialState();cloud.transactions.push(makeTx('dup'));
 const guest=initialState();guest.transactions.push({...makeTx('dup'),title:'다른 지출'});guest.transactions.push({...makeTx('refund'),kind:'refund',refundOf:'dup'});
 let i=0;const first=mergeGuestLedger(cloud,guest,()=>`new-${++i}`);
 const second=mergeGuestLedger(first.ledger,guest,()=>`again-${++i}`);
 assert.equal(first.ledger.transactions.length,3);assert.equal(second.ledger.transactions.length,3);assert.equal(second.summary.transactions,0);
 const imported=first.ledger.transactions.find(t=>t.sourceImportKey?.includes(':dup:'));
 const refund=first.ledger.transactions.find(t=>t.id==='refund');assert.equal(refund.refundOf,imported.id);
});

test('Offline changes to different transactions preserve both edits',()=>{
 const base=initialState();base.transactions.push({...makeTx('a'),revision:1},{...makeTx('b'),revision:1});
 const local=structuredClone(base),remote=structuredClone(base);
 local.transactions[0].title='로컬 변경';remote.transactions[1].title='다른 기기 변경';
 local.events.push(event('local-event'));remote.events.push(event('remote-event'));
 const out=rebaseOfflineChanges(base,local,remote);
 assert.deepEqual(out.conflicts,[]);assert.equal(out.ledger.transactions.find(x=>x.id==='a').title,'로컬 변경');
 assert.equal(out.ledger.transactions.find(x=>x.id==='b').title,'다른 기기 변경');assert.equal(out.ledger.events.length,2);
});

test('A bounded event listener does not requeue older confirmed history',()=>{
 const base=initialState();base.events.push(event('old-confirmed'));
 const local=structuredClone(base);local.events.push(event('new-local'));
 const remote=initialState();remote.events.push(event('new-remote'));
 const out=rebaseOfflineChanges(base,local,remote);
 assert.deepEqual(out.ledger.events.map(item=>item.id).sort(),['new-local','new-remote']);
});

test('Simultaneous same-transaction edits expose details and require a choice',()=>{
 const base=initialState();base.transactions.push(makeTx('a'));
 const local=structuredClone(base),remote=structuredClone(base);local.transactions[0].title='로컬';remote.transactions[0].title='원격';local.events.push({...event('rejected-local-event'),entityId:'a'});
 const out=rebaseOfflineChanges(base,local,remote);
 assert.equal(out.ledger,null);assert.deepEqual(out.conflicts,['transactions/a']);assert.equal(out.conflictDetails[0].mine.title,'로컬');
 const mine=resolveLedgerConflicts(base,local,remote,{'transactions/a':'mine'});assert.equal(mine.transactions[0].title,'로컬');
 const server=resolveLedgerConflicts(base,local,remote,{'transactions/a':'server'});assert.equal(server.transactions[0].title,'원격');assert.equal(server.events.some(item=>item.id==='rejected-local-event'),false);
});

test('Delete versus edit is a conflict, not a silent resurrection or loss',()=>{
 const base=initialState();base.transactions.push(makeTx('a'));
 const local=structuredClone(base),remote=structuredClone(base);local.transactions=[];remote.transactions[0].memo='다른 기기 수정';
 const out=rebaseOfflineChanges(base,local,remote);assert.deepEqual(out.conflicts,['transactions/a']);
 assert.equal(resolveLedgerConflicts(base,local,remote,{'transactions/a':'mine'}).transactions.length,0);
 assert.equal(resolveLedgerConflicts(base,local,remote,{'transactions/a':'server'}).transactions[0].memo,'다른 기기 수정');
});

test('Different settings merge; same setting conflicts',()=>{
 const base=initialState(),local=structuredClone(base),remote=structuredClone(base);
 local.settings.theme='dark';remote.settings.monthlyBudget=555000;
 const ok=rebaseOfflineChanges(base,local,remote);assert.equal(ok.ledger.settings.theme,'dark');assert.equal(ok.ledger.settings.monthlyBudget,555000);
 const sameLocal=structuredClone(base),sameRemote=structuredClone(base);sameLocal.settings.monthlyBudget=111000;sameRemote.settings.monthlyBudget=222000;
 assert.ok(rebaseOfflineChanges(base,sameLocal,sameRemote).conflicts.includes('settings/monthlyBudget'));
});
