import test from 'node:test';
import assert from 'node:assert/strict';
import {requireRecentAuthentication} from '../functions/account-deletion-core.mjs';

test('Account deletion requires an authenticated UID',()=>{
 assert.throws(()=>requireRecentAuthentication(null,1000),/AUTH_REQUIRED/);
});

test('Account deletion accepts only a recent auth_time',()=>{
 assert.equal(requireRecentAuthentication({uid:'alice',token:{auth_time:800}},1000),'alice');
 assert.throws(()=>requireRecentAuthentication({uid:'alice',token:{auth_time:699}},1000),/RECENT_LOGIN_REQUIRED/);
 assert.throws(()=>requireRecentAuthentication({uid:'alice',token:{auth_time:1100}},1000),/RECENT_LOGIN_REQUIRED/);
});
