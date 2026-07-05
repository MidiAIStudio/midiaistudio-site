# MidiAI Studio Homepage V10 Firestore Portal

V7 구조를 유지하면서 Firestore 포털 기능을 추가한 버전입니다.

## 추가 기능
- Google 로그인
- 내 계정 / 라이선스 상태 확인
- Firestore 공지사항 `announcements`
- Firestore 패치노트 `patchNotes`
- Firestore FAQ `faq`
- Firestore 다운로드 정보 `downloads/latest`
- 비공개 1:1 문의 `supportTickets`
- 나의 문의 / 관리자 답변 `supportTickets/{ticketId}/replies`
- 관리자 페이지: 공지 작성, 패치노트 작성, FAQ 작성, 라이선스 지급/수정, 문의 답변

## 필수 Firestore 컬렉션
- users
- licenses
- orders
- announcements
- patchNotes
- supportTickets
- faq
- downloads

## 관리자 권한
`users/{내 UID}` 문서에 아래 필드를 추가하세요.

```text
role string admin
```

## Rules
`firebase/firestore-rules.example.txt`를 참고해서 Firestore 규칙에 반영하세요.

## GitHub Desktop 적용
1. 이 zip 압축 해제
2. 안의 파일 전체를 로컬 `midiaistudio-site` 폴더에 덮어쓰기
3. GitHub Desktop에서 변경 확인
4. Commit to main
5. Push origin
