import test from 'node:test';import assert from 'node:assert/strict';
import {initialState} from '../src/domain.js';
import {changedDocuments,reconstructLedger,forCloudDocument,mergeGuestLedger} from '../src/ledger-sync.js';
const makeTx=(id,accountId='bank')=>({id,kind:'expense',date:'2026-10-20',title:'커피',amount:5600,status:'confirmed',accountId,categoryId:'cafe',createdAt:'2026-10-20T10:00:00Z'});

test('Only changed transaction is written, never replaces the entire ledger',()=>{
 const a=initialState();a.transactions.push(makeTx('t1'),makeTx('t2'));
 const b=structuredClone(a);b.transactions[0].title='커피 수정';
 const diff=changedDocuments(a,b);
 assert.equal(diff.length,1);assert.deepEqual(diff.map(x=>[x.collection,x.id,x.action]),[['transactions','t1','set']]);
});

test('Deletes and metadata budget changes are independent',()=>{
 const a=initialState();a.transactions.push(makeTx('t1'));
 const b=structuredClone(a);b.transactions=[];b.budgets.food=150000;
 const diff=changedDocuments(a,b);
 assert.equal(diff.length,2);assert.ok(diff.some(d=>d.action==='delete'&&d.id==='t1'));
 assert.ok(diff.some(d=>d.collection==='ledger'&&d.data.budgets.food===150000));
});

test('Receipt image is never embedded in Firestore transaction document',()=>{
 const tx={...makeTx('t1'),attachment:'data:image/png;base64,ABCD',attachmentPath:'users/u1/receipts/a'};
 const cleaned=forCloudDocument(tx);assert.equal(cleaned.attachment,undefined);assert.equal(cleaned.attachmentPath,'users/u1/receipts/a');
});

test('Rebuild validates cloud ledger, including budgets, accounts, categories and transactions',()=>{
 const base=initialState();const out=reconstructLedger({version:1,settings:base.settings,budgets:{food:1234},events:[]},{accounts:base.accounts,categories:base.categories,transactions:[makeTx('xyz')]});
 assert.equal(out.transactions.length,1);assert.equal(out.budgets.food,1234);
});

test('Import keeps cloud records, guest opening balances, and remaps references',()=>{
 const cloud=initialState();cloud.accounts.find(a=>a.id==='bank').openingBalance=10000;
 const guest=initialState();guest.accounts.find(a=>a.id==='bank').openingBalance=60000;guest.transactions.push(makeTx('guest-t','bank'));
 let i=0;const {ledger,imported}=mergeGuestLedger(cloud,guest,()=>`new-${++i}`);
 assert.equal(imported,1);assert.equal(ledger.transactions.length,1);
 const importedTx=ledger.transactions[0];assert.notEqual(importedTx.accountId,'bank');
 assert.equal(ledger.accounts.find(a=>a.id===importedTx.accountId).openingBalance,60000);
 assert.equal(ledger.accounts.find(a=>a.id==='bank').openingBalance,10000);
});

test('Import skips identical IDs and relinks renamed refund source',()=>{
 const cloud=initialState();cloud.transactions.push(makeTx('dup'));
 const guest=initialState();guest.transactions.push({...makeTx('dup'),title:'다른 지출'});
 guest.transactions.push({...makeTx('refund'),kind:'refund',refundOf:'dup'});
 const {ledger}=mergeGuestLedger(cloud,guest,()=>`new-item`);
 const imported=ledger.transactions.find(t=>t.id==='new-item');
 const refund=ledger.transactions.find(t=>t.id==='refund');
 assert.equal(refund.refundOf,imported.id);
 assert.equal(ledger.transactions.length,3);
});
