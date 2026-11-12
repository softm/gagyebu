# 가계부 Cloudflare 공통 계정 연동 — 단계별 적용

2026-11-12 기준 · 대상: PC 웹 우선. Android는 별도 네이티브 인증 전환 전.

## 저장소 및 서비스
- PC 웹: https://softm.github.io/gagyebu/ (`softm/gagyebu`)
- 인증·D1 Worker: https://softm-hannun-account.softm.workers.dev
- 공통 서버 코드: `softm/softm.github.io/services/cloudflare-account`
- Android: `softm/softm.android.gagyebu` — 기존 Firebase 인증 유지, 이번 웹 배포만으로 전환되지 않음.

## 코드 상태
- `src/web-account.js`: Worker `/health`의 `features.gagyebuLedger=true`일 때 새 모듈 사용. 그렇지 않으면 이전 Firebase 공통 계정 코드를 실행하여 기존 데이터와 서비스를 유지.
- `src/web-account-legacy.js`: 기존 인증·suiteAuth 장부 교환 코드 원본 보존.
- `src/web-account-cloudflare.js`: Cloudflare Google 공통 계정 로그인(웹 팝업), 사이트 범위 토큰, 계정 열기·로그아웃, 서버 장부 교환. 원격 사용자 삭제 기능은 미지원으로 막음.
- 서버 `POST /api/apps/gagyebu/ledger`: 별도 키로 HKDF 파생한 사용자별 AES-GCM 암호화 장부를 D1에 분할 저장하고 3MB 한도를 둠. revision CAS 처리, 이전 암호문 지연 정리.
- `src/account-ledger.js`: 기존의 오프라인-first 캐시/충돌 해소, 로그인 시 비로그인 장부 합치기 확인, SMS 원문/영수증 제외 로직 그대로.
- 브라우저 SDK의 액세스 토큰은 1시간 후 만료하며 sessionStorage에만 유지. 만료 시 재로그인 필요.

## 실제 활성화 전 한 번만 수행
1. Cloudflare 대시보드 → Workers & Pages → `softm-hannun-account` → Settings → Variables and Secrets
2. **Production**, 유형 **Secret**, 이름 **`GAGYEBU_LEDGER_KEY_V1`** 등록. 값은 별도로 생성한 암호학적으로 안전한 32-byte random key를 Base64로 인코딩한 것 (예: 로컬 Mac 터미널의 `openssl rand -base64 32` 출력, 사용자 비공개 보관). **기존 Google Secret 등으로 대신하지 않는다.**
3. 값은 채팅, Git 커밋, 일반 Variable에 복사하지 않는다. 초기 키를 변형하거나 삭제하면 이전에 저장한 장부를 복호화할 수 없다.
4. Deploy 후 `/health`의 `features.gagyebuLedger=true`를 확인한다.
5. PC 가계부 웹을 새로고침하면 Cloudflare 로그인 메뉴를 사용한다. 기존 IndexedDB의 `main` 비로그인 장부는 보존되며 최초 합치기는 **명시적 확인**.
6. 소액의 테스트 장부 1건으로 저장 → 새로고침 → 같은 계정 로그인 → 해당 기록 확인. 동시 수정/계정 전환/동기화 지연 테스트 후 운영 사용.

## 중요한 경계
- 로그인해도 기존 Firebase UID/원격 장부가 자동으로 새 Cloudflare UID로 복제되거나 합쳐지지 않는다.
- 기존 Firebase 계정별 로컬 캐시는 계속 IndexedDB에 유지한다. 다른 UID로 저장되는 D1 새 장부와 자동 통합하지 않는다.
- **Android 앱은 아직 Cloudflare 인증/동기화가 적용되지 않았다.** PC·Android 장부가 새 계정으로 즉시 함께 보일 것이라고 안내하지 않는다.
- 온라인 연결/키 분실/세션 만료로 동기화가 실패해도 로컬 원본을 지우지 않는다. JSON 내보내기는 계속 유지.
- 현재 암호화는 서버 측 암호화이며 Worker는 복호화 가능하다. 단말 종단간 암호화(E2EE)라고 표현하지 않는다.
- 앱 자료 중 거래·자산·분류·예산·설정만 동기화하며 영수증 원본·SMS/알림 원문과 확인 대기 후보는 서버에 전송하지 않는다.
- 실제 회원탈퇴/원격 보관소 삭제는 전체 삭제 설계 완료 전까지 비활성. 기존 Google 로그인과 계정 허브를 삭제하지 않는다.
- Android는 별도 App Link, 네이티브 PKCE와 서버 토큰 교환 구현·검증 후 전환.
