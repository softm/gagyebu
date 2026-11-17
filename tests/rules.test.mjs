import test,{after,before,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const enabled=process.env.GAGYEBU_RULES_TEST==='1';
if(!enabled){
  test('Firebase Rules emulator tests (run with npm run test:rules)',{skip:true},()=>{});
}else{
  const [{assertFails,assertSucceeds,initializeTestEnvironment},firestore,storage]=await Promise.all([
    import('@firebase/rules-unit-testing'),import('firebase/firestore'),import('firebase/storage')
  ]);
  let env;
  const now='2026-10-20T12:00:00.000Z';
  const config={version:1,schemaVersion:2,settings:{monthlyBudget:1200000,periodStartDay:1,theme:'light',hasOnboarded:false},budgets:{},initialized:true,revision:1,createdAt:now,updatedAt:now};
  const transaction={id:'tx-1',kind:'expense',date:'2026-10-20',amount:5600,title:'커피',status:'confirmed',accountId:'bank',categoryId:'cafe',memo:'',revision:1,createdAt:now,updatedAt:now};
  const history={id:'event-1',entityType:'transaction',entityId:'tx-1',action:'create',actorUid:'alice',deviceId:'device-1',createdAt:now,changedFields:['title'],before:null,after:{title:'커피'}};

  before(async()=>{env=await initializeTestEnvironment({
    projectId:'demo-gagyebu',
    firestore:{host:'127.0.0.1',port:8080,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')},
    storage:{host:'127.0.0.1',port:9199,rules:await readFile(new URL('../storage.rules',import.meta.url),'utf8')}
  });});
  beforeEach(async()=>{await env.clearFirestore();});
  after(async()=>{await env.cleanup();});

  test('owner can create a valid ledger while another UID and guests are denied',async()=>{
    const alice=env.authenticatedContext('alice').firestore(),bob=env.authenticatedContext('bob').firestore(),guest=env.unauthenticatedContext().firestore();
    const configRef=firestore.doc(alice,'users/alice/ledger/config');
    await assertSucceeds(firestore.setDoc(configRef,config));
    await assertSucceeds(firestore.setDoc(firestore.doc(alice,'users/alice/transactions/tx-1'),transaction));
    await assertFails(firestore.getDoc(firestore.doc(bob,'users/alice/transactions/tx-1')));
    await assertFails(firestore.getDoc(firestore.doc(guest,'users/alice/ledger/config')));
  });

  test('schema, revision and tombstone rules prevent malformed or physical deletes',async()=>{
    const alice=env.authenticatedContext('alice').firestore(),ref=firestore.doc(alice,'users/alice/transactions/tx-1');
    await assertSucceeds(firestore.setDoc(ref,transaction));
    await assertFails(firestore.setDoc(ref,{...transaction,revision:1,amount:'5600'}));
    await assertFails(firestore.deleteDoc(ref));
    await assertSucceeds(firestore.setDoc(ref,{id:'tx-1',deleted:true,revision:2,createdAt:now,updatedAt:'2026-10-20T12:01:00.000Z',sourceImportKey:'guest:transactions:tx-1:'}));
    await assertSucceeds(firestore.setDoc(ref,{...transaction,revision:3,updatedAt:'2026-10-20T12:02:00.000Z'}));
  });

  test('events are owner-authored and immutable except an identical retry',async()=>{
    const alice=env.authenticatedContext('alice').firestore(),ref=firestore.doc(alice,'users/alice/events/event-1');
    await assertSucceeds(firestore.setDoc(ref,history));
    await assertSucceeds(firestore.setDoc(ref,history));
    await assertFails(firestore.setDoc(ref,{...history,action:'delete'}));
    await assertFails(firestore.setDoc(firestore.doc(alice,'users/alice/events/forged'),{...history,id:'forged',actorUid:'bob'}));
  });

  test('receipt access requires the owner, UUID path, safe image and owner metadata',async()=>{
    const alice=env.authenticatedContext('alice').storage(),bob=env.authenticatedContext('bob').storage();
    const path='users/alice/receipts/123e4567-e89b-12d3-a456-426614174000',target=storage.ref(alice,path);
    const bytes=new Uint8Array([137,80,78,71]);
    await assertSucceeds(storage.uploadBytes(target,bytes,{contentType:'image/png',customMetadata:{ownerUid:'alice',transactionId:'tx-1'}}));
    await assertSucceeds(storage.getBytes(target));
    await assertFails(storage.getBytes(storage.ref(bob,path)));
    await assertFails(storage.uploadBytes(storage.ref(alice,'users/alice/receipts/not-a-uuid'),bytes,{contentType:'image/png',customMetadata:{ownerUid:'alice',transactionId:'tx-1'}}));
    await assertFails(storage.uploadBytes(storage.ref(alice,'users/alice/receipts/------------------------------------'),bytes,{contentType:'image/png',customMetadata:{ownerUid:'alice',transactionId:'tx-1'}}));
    await assertFails(storage.uploadBytes(storage.ref(alice,'users/alice/receipts/123e4567-e89b-12d3-a456-426614174001'),bytes,{contentType:'text/plain',customMetadata:{ownerUid:'alice',transactionId:'tx-1'}}));
  });

  test('rules test environment is pinned to the demo project',()=>{assert.equal(env.projectId,'demo-gagyebu');});
}
