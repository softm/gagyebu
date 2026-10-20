/** OAuth provider code exchange + identity verification. All secrets remain server-side. */
export const ALLOWED_REDIRECTS=new Set([
 'https://softm.github.io/gagyebu/',
 'http://localhost:8000/',
 'http://127.0.0.1:8000/'
]);

export function checkOAuthRequest(input,allow=ALLOWED_REDIRECTS){
 if(!input||!['kakao','naver'].includes(input.provider))throw new Error('지원하지 않는 SNS 로그인 방법입니다.');
 if(typeof input.code!=='string'||input.code.length<8||input.code.length>2048||!/^[A-Za-z0-9._~+\/-]+$/.test(input.code))throw new Error('로그인 인증 코드 형식이 잘못되었습니다.');
 if(typeof input.redirectUri!=='string'||!allow.has(input.redirectUri))throw new Error('등록되지 않은 로그인 리디렉션 주소입니다.');
 if(typeof input.state!=='string'||!/^[0-9a-f]{64}$/.test(input.state))throw new Error('로그인 요청 상태가 잘못되었습니다.');
 return true;
}

async function requireJson(response){
 if(!response.ok)throw new Error(`인증 제공자 응답 오류 (${response.status})`);
 const data=await response.json();
 if(!data||typeof data!=='object')throw new Error('인증 제공자 응답이 올바르지 않습니다.');
 return data;
}

export async function exchangeOAuth(input,{fetchImpl=fetch,createCustomToken,secrets,allowedRedirects=ALLOWED_REDIRECTS}){
 checkOAuthRequest(input,allowedRedirects);
 if(typeof createCustomToken!=='function')throw new Error('서버 인증 모듈이 초기화되지 않았습니다.');
 const {provider,code,redirectUri,state}=input;
 let profile,uid;
 if(provider==='kakao'){
  if(!secrets.kakaoRestApiKey||!secrets.kakaoClientSecret)throw new Error('카카오 서버 비밀키가 등록되지 않았습니다.');
  const params=new URLSearchParams({grant_type:'authorization_code',client_id:secrets.kakaoRestApiKey,client_secret:secrets.kakaoClientSecret,redirect_uri:redirectUri,code});
  const data=await requireJson(await fetchImpl('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=utf-8'},body:params}));
  if(!data.access_token)throw new Error('카카오 인증 토큰이 없습니다.');
  profile=await requireJson(await fetchImpl('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:`Bearer ${data.access_token}`}}));
  if(!/^\d{1,30}$/.test(String(profile.id||'')))throw new Error('카카오 사용자 ID가 올바르지 않습니다.');
  uid=`kakao:${String(profile.id)}`;
 } else {
  if(!secrets.naverClientId||!secrets.naverClientSecret)throw new Error('네이버 서버 비밀키가 등록되지 않았습니다.');
  const url=new URL('https://nid.naver.com/oauth2.0/token');
  for(const [key,value] of Object.entries({grant_type:'authorization_code',client_id:secrets.naverClientId,client_secret:secrets.naverClientSecret,code,state}))url.searchParams.set(key,value);
  const data=await requireJson(await fetchImpl(url.toString(),{method:'GET'}));
  if(!data.access_token)throw new Error('네이버 인증 토큰이 없습니다.');
  const user=await requireJson(await fetchImpl('https://openapi.naver.com/v1/nid/me',{headers:{Authorization:`Bearer ${data.access_token}`}}));
  if(user.resultcode!=='00'||!user.response?.id)throw new Error('네이버 프로필 인증에 실패했습니다.');
  profile=user.response;
  if(!/^[a-zA-Z0-9_-]{4,128}$/.test(String(profile.id)))throw new Error('네이버 사용자 ID 형식이 올바르지 않습니다.');
  uid=`naver:${profile.id}`;
 }
 const token=await createCustomToken(uid,{socialProvider:provider});
 const displayName=(provider==='kakao'?profile.kakao_account?.profile?.nickname||profile.properties?.nickname:profile.nickname)||`${provider==='kakao'?'카카오':'네이버'} 사용자`;
 return {token,displayName:String(displayName).slice(0,80)};
}
