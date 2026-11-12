/**
 * Cloudflare-only PC gagyebu.
 *
 * The active account/D1 sync protocol is web-account-cloudflare.js and
 * account-ledger.js. Retain this narrow compatibility interface until legacy
 * UI handlers are removed; it never loads Firebase SDKs or writes Firestore.
 */
export class CloudService {
 constructor(callbacks={}){this.callbacks=callbacks;this.pending=false;}
 isConfigured(){return false;}
 async queueDiff(){throw Error('기존 Firebase 동기화가 종료되었습니다. Cloudflare 공통 계정을 사용하세요.');}
 async getReceipt(){throw Error('이전 영수증은 기존 JSON 백업에서 복원해야 합니다.');}
 async materializeReceipts(state){return structuredClone(state);}
 async loginGoogle(){throw Error('Cloudflare 공통 계정 메뉴에서 로그인하세요.');}
 async loginApple(){throw Error('Cloudflare 공통 계정 메뉴에서 로그인하세요.');}
 async loginSocial(){throw Error('Cloudflare 공통 계정 메뉴에서 로그인하세요.');}
 async logout(){throw Error('Cloudflare 공통 계정 메뉴에서 로그아웃하세요.');}
}
