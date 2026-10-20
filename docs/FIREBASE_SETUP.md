# 가계부 Firebase · Google / 카카오 / 네이버 / Apple 연동 가이드

이 문서는 `https://softm.github.io/gagyebu/` (정적 GitHub Pages)에서 로그인과 **가계부 전체 기록**의 사용자별 영속 저장을 활성화하는 절차입니다.

## 0. 준비 및 현황

| 항목 | 소스 코드 | 실서비스 사용 전에 해야 할 일 |
|---|---|---|
| Firebase Google 로그인 | 구현 | Firebase 프로젝트 생성 / Google 공급자 활성화 |
| Apple 로그인 | 구현 | Apple 개발자 서비스 ID 및 Firebase 공급자 설정 |
| Kakao OAuth | 구현 | 카카오 앱 및 Redirect URI 설정 + 서버 Secrets |
| NAVER OAuth | 구현 | 네이버 로그인 앱 등록 + 서버 Secrets |
| Firestore 장부 저장 | 구현 | Firestore 생성 + 보안 규칙 배포 |
| Firebase Storage 사진 보관 | 구현 | Blaze 플랜 + Storage 생성 + 보안 규칙 배포 + CORS |
| 사용자의 기기 기록 가져오기 | 구현 | 로그인 후 설정에서 명시적으로 실행 |
| 원격 실제 계정 로그인/저장 검증 | 미검증 | 사용자 Firebase 프로젝트 설정 후 진행 |

> **가계부용 Firebase 프로젝트의 `projectId`와 웹 앱 설정이 아직 제공되지 않았습니다.** 빈 설정 상태에서는 이전 IndexedDB 가계부만 동작합니다. Firebase와의 실제 데이터 저장 완료를 주장하지 않습니다.

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 추가. 이 가계부에 **전용 프로젝트** 사용을 권장합니다.
2. 프로젝트 설정 → `내 앱` → 웹 앱 `</>` 등록. 앱 이름 `gagyebu-web`.
3. 웹 SDK 구성 `apiKey`, `authDomain`, `projectId`, `appId`, `storageBucket` 복사.
4. [GitHub `src/firebase-config.js`](https://github.com/softm/gagyebu/blob/main/src/firebase-config.js)의 빈 문자열에 값을 입력하고 `main`에 반영합니다. **웹 API 키와 앱 ID는 클라이언트용 공개 식별값**이며 Cloud Functions 비밀키나 서비스 계정 JSON은 넣지 마세요.
5. Authentication → Sign-in method → **Google 활성화**. Apple도 원한다면 Apple 공급자를 별도로 활성화합니다.
6. Authentication → Settings → Authorized domains → `softm.github.io` 추가. 커스텀 운영 도메인을 사용할 때도 별도 추가합니다.
7. Firestore Database 생성. 사용량·위치 요구에 따라 리전을 선택하되 국내 이용자 기준 서울 `asia-northeast3` 권장. **Firestore 리전은 생성 후 변경하기 어렵습니다.**
8. Cloud Storage 생성. **Blaze 사용량 기반 플랜이 필요**하며, 요금 알림과 예산 경고를 설정하세요.

## 2. 카카오 로그인 설정

1. [Kakao Developers](https://developers.kakao.com/console/app) → 앱 등록.
2. 플랫폼의 웹 사이트 도메인 `https://softm.github.io` 추가.
3. 카카오 로그인 활성화. Redirect URI: **`https://softm.github.io/gagyebu/`** (끝 `/`까지 일치).
4. 동의항목에서 이메일·닉네임의 제공은 선택사항. 이 앱은 카카오 고유 ID를 안정적인 사용자 식별자로 사용합니다.
5. REST API 키(공개 키)를 `src/firebase-config.js`의 `socialConfig.kakaoRestApiKey`에 넣습니다.
6. 카카오 Client Secret은 브라우저/공개 저장소에 절대 기록하지 않고 다음 CLI로 설정합니다.

[공식 카카오 로그인 REST API](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api)

## 3. 네이버 로그인 설정

1. [네이버 개발자 센터 – 애플리케이션 등록](https://developers.naver.com/apps/#/register)에서 네이버 로그인 앱을 등록합니다.
2. 서비스 URL: `https://softm.github.io/gagyebu/`.
3. Callback URL: **`https://softm.github.io/gagyebu/`**.
4. 로그인 연동을 위한 회원 프로필 제공 항목을 설정합니다. 로그인에서 받은 서비스별 `response.id`를 UID에 사용하고 이메일만으로는 서로 다른 SNS를 결합하지 않습니다.
5. 네이버 Client ID(공개)는 `src/firebase-config.js`의 `socialConfig.naverClientId`에 넣습니다.
6. Client Secret은 서버 Secret Manager에만 저장합니다.

[네이버 로그인 API 명세](https://developers.naver.com/docs/login/api/api.md)

## 4. Apple 로그인 (선택)

Apple Developer에서 Service ID, Apple Sign in with Apple, Private Key 등을 발급한 뒤 Firebase Auth Apple 공급자 설정을 완료합니다. Firebase Auth 콜백 도메인/URL은 **Firebase 콘솔 안내값**을 사용합니다. [공식 Firebase Apple 로그인 안내](https://firebase.google.com/docs/auth/web/apple)

## 5. 서버 비밀값과 배포

Firebase CLI에 로그인한 다음 **가계부 프로젝트에서만** 배포합니다.

```bash
npm install -g firebase-tools
firebase login
# 필요하면 .firebaserc.example을 .firebaserc로 복사 후 프로젝트 ID 교체
firebase use YOUR_GAGYEBU_FIREBASE_PROJECT_ID
cd functions && npm install && cd ..

firebase functions:secrets:set KAKAO_REST_API_KEY
firebase functions:secrets:set KAKAO_CLIENT_SECRET
firebase functions:secrets:set NAVER_CLIENT_ID
firebase functions:secrets:set NAVER_CLIENT_SECRET

firebase deploy --only firestore:rules,storage,functions:oauthExchange --project YOUR_GAGYEBU_FIREBASE_PROJECT_ID
```

- Google/Apple 로그인에는 커스텀 SNS 함수가 필요하지 않습니다.
- 카카오/네이버는 Cloud Functions v2 `asia-northeast3`에서 *authorization code → provider token → provider user ID 확인 → Firebase custom token 발급*을 수행합니다.
- 로그인 콜백은 서버에서 등록된 주소만 허용하고, 클라이언트는 64자리 난수 `state`를 세션에 보관하여 CSRF를 검증합니다.
- **서비스 계정 비밀키, 카카오/Naver Secret을 GitHub 코드나 Pages에 올리지 마세요.**
- Firebase Functions 및 Cloud Storage는 청구 계정 연결이 필요할 수 있으며 사용량에 따른 비용이 발생할 수 있습니다.

## 6. 영수증 CORS (Browser getBlob)

스토리지 버킷에 **정확한 Pages Origin만** 브라우저 CORS 읽기 허용 설정이 필요할 수 있습니다. 실제 버킷 이름을 확인하고 다음 예제를 적용합니다.

```bash
gcloud storage buckets update gs://YOUR_STORAGE_BUCKET --cors-file=storage-cors.json
```

`storage-cors.json`에는 `https://softm.github.io`에 대한 `GET`, `HEAD` 허용 설정이 있습니다. 다른 도메인은 필요한 경우 개별 추가하세요.

## 7. 가계부 Firestore 데이터 구조

```text
users/{firebaseAuthUid}/
  ledger/config                  // settings, budgets, events, version
  accounts/{accountId}           // 현금·은행·카드 자산
  categories/{categoryId}       // 지출/수입 카테고리
  transactions/{transactionId}  // 거래·미확정·이체·환불·메모·계산식·영수증 경로

Cloud Storage:
users/{firebaseAuthUid}/receipts/{uuid} // 이미지 원본 (인증된 본인만 접근)

IndexedDB:
main                           // 비로그인 장부 (이전 사용자의 자료 보존)
user:{uid}                     // 현재 기기의 로그인 장부 캐시
synced:{uid}                   // 마지막 동기화 확인 상태
 dirty:{uid}                   // 아직 확인되지 않은 로컬 수정 여부
```

- 거래 원문, 자산, 카테고리, 예산, 설정, 기록 이벤트가 사용자별 Firestore에 저장됩니다.
- 영수증 원본은 Storage에 저장하고 Firestore에는 소유자별 Storage 경로만 저장합니다. Firestore 1MiB 문서 제한을 피합니다.
- `firestore.rules`와 `storage.rules`는 **인증된 본인 UID**에만 해당 경로 읽기/쓰기를 허용합니다.
- 같은 `uid`로 로그인하면 다른 기기에서도 실시간 최신 거래를 구독합니다. 서로 다른 SNS UID는 **별도 장부**로 유지합니다. 이메일이 같아도 자동으로 병합하지 않습니다.
- Cloud Firestore는 **E2EE가 아닌 Firebase 플랫폼 보안 저장**입니다. 브라우저 IndexedDB 캐시 또한 기기 자체 암호화는 제공하지 않습니다.
- 동기화가 끝나지 않은 경우 사용자의 수정사항은 기기에 남습니다. 설정의 `미전송 기록 다시 동기화`로 재시도해야 할 수 있으며, 네트워크 오류가 지속되면 JSON 백업을 우선 내려받으세요.
- 대용량 기록은 문서별 저장으로 분산하지만, 현재 UI에서는 검색을 위한 전체 거래 내역을 구독합니다. 수만 건 이상의 데이터에서는 월별 쿼리/페이지네이션으로 변경해야 합니다.

## 8. 실제 검수 시나리오 (설정 완료 후)

1. 시크릿/브라우저 A에서 Google로 로그인, 지출 1건과 영수증 추가. Firestore과 Storage 저장 확인.
2. 다른 기기 B에서 **같은 Google 계정** 로그인 → 거래·자산·예산·영수증 열람 가능.
3. B에서 금액 수정 → A에 반영, 잔액·예산·차트 계산이 일치하는지 확인.
4. 계정 A에서 로그아웃 → 게스트 기록만 표시되고 다른 사용자 데이터가 보이지 않는지 확인.
5. 다른 계정 C 로그인 → A의 `users/{uid}` 데이터 접근이 거절되는지 Rules Simulator/Emulator로 확인.
6. 카카오·네이버 OAuth 각각 실제 계정으로 로그인→복귀→Cloud Functions→사용자 장부 생성 확인.
7. 등록되지 않은 Redirect URI, 변조된 OAuth state, 재사용한 code가 거절되는지 확인.
8. 브라우저 네트워크 차단 뒤 수정→로컬 캐시 보존→연결 재개→동기화 및 중복 없음 확인.
9. Guest 장부 생성 후 로그인 → 설정에서 명시적 가져오기 → 기존 원격 장부가 삭제되지 않고 수입·지출·자산 내역 일치 확인.
10. JSON 백업·전체 복원·CSV 내보내기, 카드대금 상환 중복집계 방지 확인.

## 9. 아직 포함되지 않은 기능

- Google/카카오/네이버/Apple 간 **여러 SNS 계정 연결(동일 장부로 묶기)**은 별도 계정 소유권 확인·병합 UX가 필요합니다.
- 사용자간 공동 장부/초대, 금융기관 자동 조회, 암호화된 E2EE 동기화는 포함되지 않습니다.
- Firebase 프로젝트가 실제 준비되지 않았기 때문에 **운영 로그인·Firestore 실쓰기 테스트는 실행하지 않았습니다**.
