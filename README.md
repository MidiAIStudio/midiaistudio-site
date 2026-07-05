# MidiAI Studio Homepage V10 Portal

V9 기반 패치 버전입니다. 기존 랜딩 페이지 구조를 유지하면서 디스코드 의존도를 줄이기 위한 홈페이지 포털 기능을 추가했습니다.

## 추가 기능

- 공지사항: Firestore `announcements` 컬렉션에서 불러오기
- 패치노트: Firestore `patch_notes` 컬렉션에서 불러오기
- 1:1 비공개 문의: 사용자가 로그인 후 문의 작성
- 나의 문의: 본인이 작성한 문의와 관리자 답변 확인
- 관리자 포털: 공지사항 작성, 패치노트 작성, 문의 답변
- 기존 라이선스 구조 유지: `licenses`는 읽기 전용, `users`는 로그인 기록 저장

## 관리자 설정

`assets/js/config.js`에서 관리자 이메일을 설정하세요.

```js
adminEmails: ["kantzz111@gmail.com"]
```

또는 Firestore에 아래 문서를 만들면 해당 UID도 관리자 UI가 표시됩니다.

```text
admins/{UID}
  active: true
```

보안상 실제 권한은 Firestore Rules가 결정합니다. `firebase/firestore-rules.example.txt` 내용을 Firebase 콘솔 Rules에 반영하세요.

## Firestore 컬렉션

```text
announcements/{id}
  title, content, pinned, createdAt, updatedAt, authorUid, authorEmail

patch_notes/{id}
  version, title, content, createdAt, updatedAt, authorUid, authorEmail

support_tickets/{id}
  uid, email, displayName, category, title, content, status, createdAt, updatedAt, replies[]
```

## 배포

Firebase Hosting 또는 GitHub Pages에 업로드하면 됩니다. Google 로그인은 로컬 `file://`보다 Hosting 환경에서 테스트하는 것을 권장합니다.
