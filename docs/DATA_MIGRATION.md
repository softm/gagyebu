# Firestore 스키마와 마이그레이션

## 현재 스키마

클라우드 장부는 `schemaVersion: 2`입니다. 설정/예산만 `users/{uid}/ledger/config`에 두고, 자산·분류·거래·이력은 각각 문서로 분리합니다.

```text
users/{uid}/ledger/config
users/{uid}/accounts/{accountId}
users/{uid}/categories/{categoryId}
users/{uid}/transactions/{transactionId}
users/{uid}/events/{eventId}
users/{uid}/receipts/{receiptId}  # Cloud Storage
```

자산·분류·거래와 config에는 정수 `revision`, UTC ISO 8601 `createdAt`/`updatedAt`이 있습니다. 변경 시 클라이언트는 마지막으로 본 revision을 Firestore 트랜잭션 안에서 확인합니다. 삭제는 문서를 즉시 없애지 않고 `{deleted: true, revision, createdAt, updatedAt}` tombstone으로 갱신하여 다른 기기의 수정과 충돌하는지 판별합니다. 클라이언트 캐시는 tombstone revision도 숨은 동기화 메타데이터로 기억하므로 초기화나 명시적 복원으로 같은 ID가 다시 만들어져도 기존 삭제 버전 다음 revision으로 기록합니다.

## schemaVersion 1 → 2

이전 버전의 `ledger/config.events` 배열은 로그인 초기화 과정에서 다음 순서로 옮깁니다.

1. 기존 이벤트 ID를 그대로 사용해 `events/{eventId}`에 최대 350개씩 `set`합니다.
2. 모든 이벤트 쓰기가 성공한 뒤 config에 `schemaVersion: 2`, `revision`, 시각 필드를 기록합니다.
3. 마지막으로 config의 `events` 필드를 제거합니다.

중간에 실패해도 기존 배열은 남습니다. 재시도는 같은 이벤트 문서 ID와 동일 내용만 쓰므로 중복을 만들지 않습니다. 이벤트 규칙은 생성과 동일 내용 재시도만 허용하고 내용 변경/삭제는 거부합니다.

## 로컬 데이터와 재연결

- 게스트: IndexedDB `main`
- 로그인 사용자 캐시: `user:{uid}`
- 마지막 서버 확인 기준선: `synced:{uid}`
- 미확인 변경 표시: `dirty:{uid}`

로그인 상태의 수정은 먼저 사용자별 캐시와 dirty 플래그를 한 트랜잭션으로 저장합니다. 재연결하면 기준선/기기/서버의 3-way 병합을 수행합니다. 같은 엔터티 또는 같은 설정 키가 양쪽에서 달라졌으면 업로드를 멈추고 건별 선택 UI를 표시합니다.

## 제한

- 현재 화면은 잔액 계산과 검색을 위해 거래 컬렉션 전체를 구독합니다. 수만 건 규모를 위한 월별 페이지네이션은 후속 작업입니다.
- 한 번의 원자적 클라이언트 동기화는 Firestore 제한을 고려해 450개 변경으로 제한합니다. 더 큰 가져오기는 작은 묶음으로 나눠야 합니다.
- tombstone과 오래된 이벤트의 서버 보존/정리 정책은 운영 프로젝트에서 백업 정책을 정한 뒤 별도 관리 작업으로 적용해야 합니다.
