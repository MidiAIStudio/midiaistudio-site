# MidiAI Studio Homepage V14

## 패치 내용

- 언어 전환 안정화
  - 한국어 / English / 日本語 버튼 전환 즉시 반영
  - `localStorage`에 선택 언어 저장
  - 페이지 이동/새로고침 후에도 언어 유지

- Firestore 실시간 갱신 보강
  - 공지사항 `announcements` 실시간 반영
  - 패치노트 `patchNotes` 실시간 반영
  - FAQ `faq` 실시간 반영
  - 다운로드 `downloads/latest` 실시간 반영

- 1:1 문의 보강
  - 문의 등록 `supportTickets` 생성
  - 나의 문의 실시간 목록
  - 문의 상세 실시간 표시
  - replies 서브컬렉션 실시간 답변
  - 관리자 문의 목록/답변 실시간 반영

## 중요: Firestore Rules 적용 필요

`firebase/firestore-rules.example.txt` 내용을 Firebase Console > Firestore > 규칙에 적용해야 합니다.

권한 오류가 보이면 대부분 아래 원인입니다.

1. Firestore Rules 미적용
2. users/{UID} 문서에 `role: "admin"` 누락
3. Firebase Authentication 승인 도메인 누락
4. API Key HTTP referrer 제한에 현재 도메인 누락

## 필요한 컬렉션

- users
- licenses
- announcements
- patchNotes
- faq
- downloads
- supportTickets
- supportTickets/{ticketId}/replies

## 관리자 권한

관리자 계정의 users/{UID} 문서에 아래 필드를 추가하세요.

```text
role string admin
```
