/** Pure authorization guard for the destructive account-data deletion callable. */
export function requireRecentAuthentication(auth,nowSeconds=Math.floor(Date.now()/1000),maxAgeSeconds=300){
  if(!auth?.uid)throw new Error('AUTH_REQUIRED');
  const authenticatedAt=Number(auth.token?.auth_time);
  if(!Number.isFinite(authenticatedAt)||authenticatedAt>nowSeconds+60||nowSeconds-authenticatedAt>maxAgeSeconds)throw new Error('RECENT_LOGIN_REQUIRED');
  return auth.uid;
}
