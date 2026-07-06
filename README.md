# MidiAI Studio Homepage V15

## 포함 기능
- 다국어 보강: 한국어 / English / 日本語 버튼 전환, 페이지 이동 후 언어 유지
- 관리자 페이지에서 공지사항 / 패치노트 / FAQ 작성
- 관리자 페이지에서 공지사항 / 패치노트 / FAQ 수정 및 삭제
- 공지사항 / 패치노트 / FAQ 페이지 실시간 갱신
- 1:1 문의 작성
- 나의 문의 실시간 목록
- 문의 상세에서 작성자 또는 관리자가 문의 수정 / 종료 / 삭제
- 관리자 답변 및 문의 상태 갱신

## 적용 방법
1. ZIP 압축 해제
2. 내용물을 GitHub 로컬 저장소 루트에 복사
3. GitHub Desktop에서 변경 확인
4. Commit / Push
5. Firebase Console > Firestore Rules에 `firebase/firestore-rules.example.txt` 내용 반영

## 주의
- 관리자 기능은 `users/{UID}.role = "admin"`인 계정만 사용할 수 있습니다.
- Firestore Rules를 적용하지 않으면 등록은 되더라도 수정/삭제가 거부될 수 있습니다.
