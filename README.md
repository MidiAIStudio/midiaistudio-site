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


## V18 Google Login Debug Patch

Google 로그인 팝업이 `The requested action is invalid.` 로 닫히는 경우를 추적하기 위해 로그인 오류 메시지를 상세화했습니다.

필수 확인:
1. Firebase Authentication > 승인된 도메인
   - midiaistudio.com
   - www.midiaistudio.com
   - midiaistudio.firebaseapp.com
   - midiaistudio.web.app
   - localhost
   - 127.0.0.1

2. Google Cloud > API 및 서비스 > 사용자 인증 정보 > Browser key 웹사이트 제한사항
   - https://midiaistudio.com/*
   - https://www.midiaistudio.com/*
   - https://midiaistudio.firebaseapp.com/*
   - https://midiaistudio.web.app/*
   - http://localhost:5500/*
   - http://127.0.0.1:5500/*

3. `assets/js/config.js`의 `apiKey`는 Firebase Console > 프로젝트 설정 > 내 앱 > 웹 앱 구성에 표시되는 Web API Key와 정확히 일치해야 합니다.
