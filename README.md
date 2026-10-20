# 가계부 (`gagyebu`)

> 거래·자산·예산·영수증·설정까지 내 계정에 보관하는 로컬 우선 가계부.

- **웹 앱:** https://softm.github.io/gagyebu/ (Pages 배포 성공 후 접속)
- **저장소:** https://github.com/softm/gagyebu

## 현재 동작하는 기능

- 홈: 정산기간 수입·지출·잔여예산, 카테고리 분석, 최근 거래, 확인 필요 거래함.
- 거래: 지출·수입·이체·카드대금 상환·환불 입력/수정/삭제/확정, 검색 및 필터.
- 입력 계산기: `12000*3-2000` 같은 계산식 평가 및 결과·계산식 저장, 영수증 이미지 로컬 첨부(최대 1.5MB).
- 미정리: 문자/알림 내용 직접 붙여넣기, CSV 가져오기, 중복 의심 표시 후 수동 확인.
- 달력/분석: 일별 수입·지출, 기간별 통계, 카테고리별 비중, 6개 기간 추이.
- 자산: 현금·은행 계좌·신용카드(부채) 관리, 계좌 간 이체와 카드대금 상환 구분.
- 설정: 월 시작일(1~28일), 월 예산, 카테고리 및 카테고리별 예산, 다크 모드.
- JSON 전체 백업·복원, CSV 내보내기. IndexedDB 저장. PWA/오프라인 동작 지원.

## 회계 처리

- 지출은 `expense`, 수입은 `income`. 현금/계좌에서 지출하면 자산 감소; 카드로 지출하면 카드 부채 증가.
- `transfer`는 계좌 간 이동이므로 소비/수입에서 제외.
- `repayment`는 은행에서 카드로 대금을 지급한 것으로, 은행 잔액과 카드 부채 감소(소비에는 추가하지 않음).
- `refund`는 해당 기간 순지출에서 차감. 가능하면 원거래를 연결.
- `pending`은 정식 지출/수입/잔액에서 제외. 사용자가 직접 확정.
- 모든 금액은 KRW **정수 원 단위**로 저장하며, 부동소수점 금액 누적을 하지 않음.

## 로그인 및 사용자별 데이터 보관

- **Google · Apple**: Firebase Authentication 로그인(콘솔에서 공급자 활성화 필요).
- **카카오 · 네이버**: SNS OAuth → Firebase Functions 비밀키 서버 검증 → Firebase custom token 발급.
- **Cloud Firestore**: 사용자 UID별 `transactions`, `accounts`, `categories`, `ledger/config`에 거래·자산·예산·설정·수정 이력 보관.
- **Cloud Storage**: 영수증 원본을 개인 UID 경로에 보관. 이미지 데이터는 Firestore 문서에 인라인 저장하지 않음.
- **기기 데이터 보호**: 비로그인 기록은 기존 IndexedDB에 유지, 로그인 후 사용자가 명시적으로 가져오기. 실패 시 재전송/JSON 백업 제공.

**설정 미완료:** `src/firebase-config.js`의 설정값이 비어 있어 배포 직후에는 로컬 기능만 동작합니다. 실제 SNS 로그인/Firestore 저장을 활성화하려면 [Firebase 연결 가이드](docs/FIREBASE_SETUP.md)대로 프로젝트, 인증 공급자, Cloud Functions Secrets, Firestore/Storage Rules를 설정해야 합니다. 서로 다른 소셜 제공자 간 계정 연결은 아직 지원하지 않습니다.

## 로컬 실행

외부 패키지가 필요 없는 정적 웹앱입니다. ES 모듈과 IndexedDB 때문에 `file://`이 아닌 HTTP 서버에서 실행해야 합니다.

```sh
python3 -m http.server 8000
# http://localhost:8000
```

테스트:

```sh
node --test tests/*.test.mjs
node --check src/app.js
```

## 배포

`main` 브랜치 루트의 정적 파일을 GitHub Pages 기본 **Deploy from a branch / main / (root)** 방식으로 게시합니다. `.github/workflows/ci.yml`은 테스트만 수행하며 Pages 배포를 중복 실행하지 않습니다.

## 데이터 및 개인정보

게스트 데이터는 브라우저 IndexedDB에 저장됩니다. Firebase 설정 후 로그인하면 사용자의 계정별 거래·자산·예산·설정이 Firestore에 저장되고 사진은 Storage에 저장됩니다. GitHub Pages는 프런트엔드 코드만 제공합니다. 은행 계좌 자동 조회는 제공하지 않습니다.

기기 변경, 캐시 삭제, 브라우저 데이터 초기화, 사생활 보호모드에서는 기록을 잃을 수 있습니다. **설정 → JSON 전체 백업**을 수시로 이용하세요. 백업 JSON에는 거래 내용과 첨부한 영수증이 포함될 수 있으니 외부 공개 금지입니다.

## 제한과 후속 계획

- 금융기관 자동연동, SMS/Android 알림 직접 읽기, OCR, 여러 SNS 계정을 동일 장부로 연결, 공동 장부는 **미구현**.
- 텍스트 붙여넣기 및 CSV는 형식에 따라 인식에 한계가 있으며 항상 사용자 검토 후 확정합니다.
- 초기 카드 미상환액은 신용카드 자산의 `초기 잔액`에 입력합니다.
- 개인/공동 정산의 전체 복식부기 및 다중통화는 후속 설계 대상.

기획 문서: `docs/PRD.md`.
