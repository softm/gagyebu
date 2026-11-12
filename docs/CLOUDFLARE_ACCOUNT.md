# 가계부 Cloudflare 공통 계정 연동 — 단계별 적용

2026-11-12 기준 · PC 웹 및 Android 모두 Cloudflare 인증·D1 연결 코드 적용. 실제 교차 기기 로그인과 기존 Firestore 서버 장부 이관은 미검증.

## 저장소 및 서비스
- PC 웹: https://softm.github.io/gagyebu/ (`softm/gagyebu`)
- 인증·D1 Worker: https://softm-hannun-account.softm.workers.dev
- 공통 서버 코드: `softm/softm.github.io/services/cloudflare-account`
- Android: `softm/softm.android.gagyebu` — 네이티브 Cloudflare PKCE 인증·Bearer 교환 및 D1 동기화 코드 적용.

## 코드 상태
- `src/web-account.js`: Worker `/health`의 `features.gagyebuLedger=true`에서만 Cloudflare 모듈 사용. 연결 실패 또는 비활성일 때는 로컬 장부를 그대로 보존하고 로그인만 오류 처리하며 Firebase로 자동 전환하지 않음.
- `src/web-account-legacy.js`: 과거 참고 및 이관을 위한 소스 사본. 현재 PC 런타임은 로드하지 않음.
- `src/web-account-cloudflare.js`: Cloudflare Google 공통 계정 로그인(웹 팝업), 사이트 범위 토큰, 계정 열기·로그아웃, 서버 장부 교환. 원격 사용자 삭제 기능은 미지원으로 막음.
- 서버 `POST /api/apps/gagyebu/ledger`: 별도 키로 HKDF 파생한 사용자별 AES-GCM 암호화 장부를 D1에 분할 저장하고 3MB 한도를 둠. revision CAS 처리, 이전 암호문 지연 정리.
- `src/account-ledger.js`: 기존의 오프라인-first 캐시/충돌 해소, 로그인 시 비로그인 장부 합치기 확인, SMS 원문/영수증 제외 로직 그대로.
- 브라우저 SDK의 액세스 토큰은 1시간 후 만료하며 sessionStorage에만 유지. 만료 시 재로그인 필요.

## 실제 활성화 전 한 번만 수행
1. Cloudflare 대시보드 → Workers & Pages → `softm-hannun-account` → Settings → Variables and Secrets
2. **Production**, 유형 **Secret**, 이름 **`GAGYEBU_LEDGER_KEY_V1`** 등록. 값은 별도로 생성한 암호학적으로 안전한 32-byte random key를 Base64로 인코딩한 것 (예: 로컬 Mac 터미널의 `openssl rand -base64 32` 출력, 사용자 비공개 보관). **기존 Google Secret 등으로 대신하지 않는다.**
3. 값은 채팅, Git 커밋, 일반 Variable에 복사하지 않는다. 초기 키를 변형하거나 삭제하면 이전에 저장한 장부를 복호화할 수 없다.
4. Deploy 후 `/health`의 `features.gagyebuLedger=true`를 확인한다.
5. PC 가계부 웹을 새로고침하면 Cloudflare 로그인 메뉴를 사용한다. 기존 IndexedDB의 `main` 비로그인 장부는 보존되며 최초 합치기는 **명시적 확인**. 기존 Firebase UID 로컬 거래가 하나 발견되면 별도로 사용자 확인 후 복사.
6. 소액의 테스트 장부 1건으로 저장 → 새로고침 → 같은 계정 로그인 → 해당 기록 확인. 동시 수정/계정 전환/동기화 지연 테스트 후 운영 사용.

## 2026-11-12 코드 안전 점검
- Cloudflare /health 호출이 일시적으로 실패하거나 타임아웃되면 **Firebase 계정으로 자동 전환하지 않고** 오류를 표시합니다. 로컬 장부는 계속 보존하며 다음 로그인 시 재시도합니다.
- `features.gagyebuLedger=false`가 서버에서 정상 응답으로 명시된 경우에만 레거시 모듈을 선택합니다.
- PC GitHub CI는 정적 코드·단위 테스트이며 실제 Google 로그인, D1 쓰기 → 새로고침 → 다시 읽기, PC↔Android 동기화의 성공 증거가 아닙니다.
- Android는 Google OAuth 네이티브 PKCE/앱 링크 및 Worker 전용 세션 교환 구현이 필요합니다. Firebase Auth 토큰을 Cloudflare 세션으로 간주해서 전송하거나 장부를 덮어쓰면 안 됩니다.

## 중요한 경계
- 로그인해도 기존 Firebase UID/원격 장부가 자동으로 새 Cloudflare UID로 복제되거나 합쳐지지 않는다.
- 기존 Firebase 계정별 로컬 캐시는 계속 IndexedDB에 유지한다. 단일 로컬 레거시 장부가 발견된 경우 사용자 동의 후에만 복사한다. 기기에 없는 **Firestore 서버 원격 데이터는 자동 이전되지 않는다**.
- **Android 앱의 Cloudflare 인증·동기화 코드가 적용됐다.** 실제 설치 APK와 PC·Android 상호 장부 확인은 아직 검증하지 않았으므로 동일 계정 데이터 공유 성공을 단정하지 않는다.
- 온라인 연결/키 분실/세션 만료로 동기화가 실패해도 로컬 원본을 지우지 않는다. JSON 내보내기는 계속 유지.
- 현재 암호화는 서버 측 암호화이며 Worker는 복호화 가능하다. 단말 종단간 암호화(E2EE)라고 표현하지 않는다.
- 앱 자료 중 거래·자산·분류·예산·설정만 동기화하며 영수증 원본·SMS/알림 원문과 확인 대기 후보는 서버에 전송하지 않는다.
- 실제 회원탈퇴/원격 보관소 삭제는 전체 삭제 설계 완료 전까지 비활성. 기존 Google 로그인과 계정 허브를 삭제하지 않는다.
- Android App Link, 네이티브 PKCE, 서버 토큰 교환 코드 적용 및 CI 컴파일 완료. 실기기 웹 로그인 복귀와 동일 장부 조회는 사용자 테스트 필요.
