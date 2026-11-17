const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');

initializeApp();
const kakaoRestApiKey=defineSecret('KAKAO_REST_API_KEY');
const kakaoClientSecret=defineSecret('KAKAO_CLIENT_SECRET');
const naverClientId=defineSecret('NAVER_CLIENT_ID');
const naverClientSecret=defineSecret('NAVER_CLIENT_SECRET');
const allowedOrigins=['https://softm.github.io','http://localhost:8000','http://127.0.0.1:8000'];
const attempts=new Map();

function enforceRateLimit(request){
 const forwarded=String(request.rawRequest?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
 const key=request.rawRequest?.ip||forwarded||'unknown',now=Date.now();
 const recent=(attempts.get(key)||[]).filter(time=>now-time<60000);
 if(recent.length>=12)throw new HttpsError('resource-exhausted','잠시 후 다시 로그인해 주세요.');
 recent.push(now);attempts.set(key,recent);
 if(attempts.size>1000)for(const [candidate,times] of attempts)if(!times.some(time=>now-time<60000))attempts.delete(candidate);
}

exports.oauthExchange=onCall({
 region:'asia-northeast3',
 secrets:[kakaoRestApiKey,kakaoClientSecret,naverClientId,naverClientSecret],
 memory:'256MiB',timeoutSeconds:30,maxInstances:10,cors:allowedOrigins
},async request=>{
 const {checkAllowedOrigin,exchangeOAuth}=await import('./oauth-core.mjs');
 try{
  checkAllowedOrigin(request.rawRequest?.headers?.origin);enforceRateLimit(request);
  return await exchangeOAuth(request.data,{
   secrets:{
    kakaoRestApiKey:kakaoRestApiKey.value(),kakaoClientSecret:kakaoClientSecret.value(),
    naverClientId:naverClientId.value(),naverClientSecret:naverClientSecret.value()
   },
   createCustomToken:(uid,claims)=>getAuth().createCustomToken(uid,claims)
  });
 }catch(error){
  // Never log provider authorization codes, access tokens, client secrets, or profile data.
  const message=error.message||'SNS 인증에 실패했습니다.';
  if(error instanceof HttpsError)throw error;
  if(/리디렉션|요청 상태|인증 코드 형식|로그인 방법|PKCE|요청 출처/.test(message))throw new HttpsError('invalid-argument',message);
  if(/등록되지 않았습니다|비밀키/.test(message))throw new HttpsError('failed-precondition','서버의 SNS 로그인 설정을 확인해주세요.');
  throw new HttpsError('unauthenticated','SNS 계정 인증에 실패했습니다. 다시 로그인해 주세요.');
 }
});

exports.deleteAccountData=onCall({
 region:'asia-northeast3',memory:'512MiB',timeoutSeconds:120,maxInstances:5,cors:allowedOrigins
},async request=>{
 const {requireRecentAuthentication}=await import('./account-deletion-core.mjs');
 let uid;
 try{checkDeletionOrigin(request);if(request.data?.confirm!==true)throw new Error('CONFIRM_REQUIRED');uid=requireRecentAuthentication(request.auth);}
 catch(error){
  if(error.message==='AUTH_REQUIRED')throw new HttpsError('unauthenticated','로그인이 필요합니다.');
  if(error.message==='RECENT_LOGIN_REQUIRED')throw new HttpsError('failed-precondition','계정 삭제 전에 최근 로그인을 다시 확인해 주세요.');
  throw new HttpsError('invalid-argument','허용되지 않은 요청입니다.');
 }
 try{
  await getStorage().bucket().deleteFiles({prefix:`users/${uid}/receipts/`,force:true});
  const firestore=getFirestore();await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
  await getAuth().deleteUser(uid);
  return {deleted:true};
 }catch{
  // Do not expose bucket names, document paths, or backend error details.
  throw new HttpsError('internal','계정 데이터 삭제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
 }
});

function checkDeletionOrigin(request){
 const origin=request.rawRequest?.headers?.origin;
 if(typeof origin!=='string'||!allowedOrigins.includes(origin))throw new Error('ORIGIN_NOT_ALLOWED');
}
