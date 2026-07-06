# MidiAI Studio Homepage V17 - Admin Dashboard

V17 adds an operations-oriented admin dashboard on top of V16.

## Added

- Admin dashboard counters: users, active licenses, open tickets, notices, patch notes, orders
- User/license management table
  - Search by email/name/UID/HWID
  - Filter by license status
  - Quick grant: Lifetime / Trial / Ban
  - HWID reset action
- Download/latest version management from the admin page
- Keeps V16 table-style content management for notices, patch notes, FAQ, and support tickets

## Firestore collections used

- users
- licenses
- orders
- announcements
- patchNotes
- faq
- supportTickets
- downloads/latest

## Important

Apply `firebase/firestore-rules.example.txt` to Firestore Rules.
Your admin account must have:

```text
users/{YOUR_UID}/role = "admin"
```

## Deploy

Copy all files into the GitHub Pages repository root, then commit and push with GitHub Desktop.


## V18.1 Modal Edit Patch
- 관리자 공지/패치노트/FAQ 수정 시 브라우저 prompt 제거
- 제목/내용/공개여부/상단고정/버전/순서를 한 번에 수정하는 모달 추가
- 문의 수정도 제목/내용/상태를 모달에서 변경
- 기존 Firestore 실시간 갱신 구조 유지
