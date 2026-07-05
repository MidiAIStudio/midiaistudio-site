# MidiAI Studio Homepage V13 Realtime Admin

관리자 페이지에서 공지사항/패치노트/FAQ를 작성하면 Firestore에 저장되고, 공개 페이지가 `onSnapshot` 기반으로 즉시 갱신되는 버전입니다.

## 핵심 변경
- `notices.html`: announcements 실시간 구독
- `notice.html`: 공지 상세 실시간 구독
- `patch-notes.html`: patchNotes 실시간 구독
- `faq.html`: FAQ 실시간 구독
- `downloads.html/index.html`: downloads/latest 실시간 구독
- `admin.html`: 저장 완료 후 바로 확인 링크 표시

## 필수 Firestore Rules
`announcements`, `patchNotes`, `faq`, `downloads`는 공개 read, admin write가 필요합니다.
`users/{UID}`에 `role: admin`이 있어야 관리자 저장이 됩니다.
