const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');

initializeApp();
const kakaoRestApiKey=defineSecret('KAKAO_REST_API_KEY');
const kakaoClientSecret=defineSecret('KAKAO_CLIENT_SECRET');
const naverClientId=defineSecret('NAVER_CLIENT_ID');
const naverClientSecret=defineSecret('NAVER_CLIENT_SECRET');

exports.oauthExchange=onCall({
 region:'asia-northeast3',
 secrets:[kakaoRestApiKey,kakaoClientSecret,naverClientId,naverClientSecret],
 memory:'256MiB',timeoutSeconds:30,maxInstances:10
},async request=>{
 const {exchangeOAuth}=await import('./oauth-core.mjs');
 try{
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
  if(/리디렉션|요청 상태|인증 코드 형식|로그인 방법/.test(message))throw new HttpsError('invalid-argument',message);
  if(/등록되지 않았습니다|비밀키/.test(message))throw new HttpsError('failed-precondition','서버의 SNS 로그인 설정을 확인해주세요.');
  throw new HttpsError('unauthenticated','SNS 계정 인증에 실패했습니다. 다시 로그인해 주세요.');
 }
});