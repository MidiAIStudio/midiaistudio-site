MidiAI Studio 자유게시판 사진/영상/MIDI 첨부

덮어쓰기 파일:
- assets/js/app.js
- assets/css/style.css
- board-write.html
- board-post.html

Firebase Storage 규칙 (업로드 필수):
- firebase/storage-rules.example.txt 내용을
  Firebase Console > Storage > 규칙에 붙여넣고 [게시] 하세요.

Firebase Storage CORS (MIDI 재생 필수):
브라우저에서 MIDI를 재생하려면 CORS가 필요합니다.
1) Google Cloud SDK(gsutil) 설치 후 로그인
2) 아래 명령 실행 (버킷명은 Firebase 프로젝트에 맞게):

   gsutil cors set firebase/storage-cors.json gs://midiaistudio.firebasestorage.app

   또는 구형 버킷명:
   gsutil cors set firebase/storage-cors.json gs://midiaistudio.appspot.com

3) 적용 후 게시글 페이지에서 ▶ 재생 버튼 확인

지원 기능:
- JPG / PNG / WEBP / GIF 이미지 첨부
- MP4 / WEBM 영상 첨부
- MID / MIDI 파일 첨부 + 인라인 재생/다운로드
- 게시글당 최대 5개
- 파일당 최대 50MB

적용 후 확인:
- Storage 규칙 + CORS 적용
- 배포 후 Ctrl+F5 새로고침
