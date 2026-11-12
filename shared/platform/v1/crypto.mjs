const encoder = new TextEncoder();
export function base64(bytes) {
  let value = ''; const array = new Uint8Array(bytes);
  for (let i=0;i<array.length;i+=16384) value += String.fromCharCode(...array.subarray(i,i+16384));
  return btoa(value);
}
export function unbase64(text) { return Uint8Array.from(atob(text), c=>c.charCodeAt(0)); }
export const randomSecret = () => base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
export async function sha256(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export async function challengeFor(verifier) {
  return base64(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
async function derive(password, salt, iterations) {
  if (typeof password !== 'string' || password.length < 10) throw Error('보관소 암호는 10자 이상이어야 합니다.');
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:unbase64(salt),iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(value,password,context) {
  const salt=base64(crypto.getRandomValues(new Uint8Array(16))), iv=crypto.getRandomValues(new Uint8Array(12));
  const iterations=310000, key=await derive(password,salt,iterations);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},key,encoder.encode(JSON.stringify(value)));
  return {v:1,algorithm:'AES-GCM',iterations,salt,iv:base64(iv),ct:base64(ct)};
}
export async function unseal(envelope,password,context) {
  if (envelope?.v!==1 || envelope.algorithm!=='AES-GCM' || envelope.iterations!==310000 || typeof envelope.salt!=='string' || unbase64(envelope.salt).length!==16 || unbase64(envelope.iv).length!==12) throw Error('지원하지 않는 암호화 형식입니다.');
  const key=await derive(password,envelope.salt,envelope.iterations);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(envelope.iv),additionalData:encoder.encode(context)},key,unbase64(envelope.ct))));
}
