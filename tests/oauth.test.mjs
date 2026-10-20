import test from 'node:test';import assert from 'node:assert/strict';
import {checkOAuthRequest,exchangeOAuth} from '../functions/oauth-core.mjs';
const input={provider:'kakao',code:'AUTHCODE0123456',state:'0'.repeat(64),redirectUri:'https://softm.github.io/gagyebu/'};
const ok=data=>({ok:true,json:async()=>data});
const secrets={kakaoRestApiKey:'restkey',kakaoClientSecret:'test_secret',naverClientId:'test_client',naverClientSecret:'test_secret'};

test('Rejects arbitrary redirects; tokens cannot be redirected to attacker website',()=>{
 assert.throws(()=>checkOAuthRequest({...input,redirectUri:'https://phishing.example/'}),/리디렉션/);
});

test('Rejects invalid CSRF state and unrecognized SNS',()=>{
 assert.throws(()=>checkOAuthRequest({...input,state:'invalid'}),/상태/);
 assert.throws(()=>checkOAuthRequest({...input,provider:'fake'}),/방법/);
});

test('Kakao access token is verified server-side; UID is based on ID not email',async()=>{
 const seen=[];const result=await exchangeOAuth(input,{
  secrets,
  fetchImpl:async(url,opts)=>{seen.push({url,opts});return url.includes('/oauth/token')?ok({access_token:'provider_token'}):ok({id:12345,kakao_account:{profile:{nickname:'테스터'}}});},
  createCustomToken:async(uid,claims)=>{assert.equal(uid,'kakao:12345');assert.equal(claims.socialProvider,'kakao');return 'firebase_signed_token';}
 });
 assert.equal(result.token,'firebase_signed_token');assert.equal(result.displayName,'테스터');assert.equal(seen.length,2);assert.ok(!seen[0].url.includes('restkey'));
});

test('Naver stable per-app identifier and server-side secret exchange',async()=>{
 let called=0;
 const result=await exchangeOAuth({...input,provider:'naver'},{
  secrets,
  fetchImpl:async(url)=>{called++;return url.includes('/token')?ok({access_token:'token'}):ok({resultcode:'00',response:{id:'naverUnique_1234',nickname:'네이버'}});},
  createCustomToken:async(uid)=>{assert.equal(uid,'naver:naverUnique_1234');return 'signed';}
 });
 assert.equal(called,2);assert.equal(result.token,'signed');
});

test('Missing provider secrets fail closed, no fake login path',async()=>{
 await assert.rejects(exchangeOAuth(input,{secrets:{},createCustomToken:async()=>''}),/비밀키/);
});