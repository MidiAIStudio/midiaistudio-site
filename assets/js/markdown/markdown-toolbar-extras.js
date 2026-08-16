/** Snippet helpers + internal link picker for Markdown editor */

const ALERT_SNIPPETS = {
  NOTE: '> [!NOTE]\n> ',
  TIP: '> [!TIP]\n> ',
  WARNING: '> [!WARNING]\n> ',
  IMPORTANT: '> [!IMPORTANT]\n> ',
  CAUTION: '> [!CAUTION]\n> '
};

export function wrapSelection(getSelection, setSelection, before, after = '', placeholder = '') {
  const { start, end, text } = getSelection();
  const selected = text.slice(start, end) || placeholder;
  const next = text.slice(0, start) + before + selected + after + text.slice(end);
  const cursor = start + before.length + selected.length + after.length;
  setSelection(next, start + before.length, cursor - after.length);
}

export function insertAtCursor(getSelection, setSelection, snippet) {
  const { start, end, text } = getSelection();
  const next = text.slice(0, start) + snippet + text.slice(end);
  const pos = start + snippet.length;
  setSelection(next, pos, pos);
}

export function insertAlert(getSelection, setSelection, kind = 'NOTE') {
  insertAtCursor(getSelection, setSelection, ALERT_SNIPPETS[kind] || ALERT_SNIPPETS.NOTE);
}

export function insertSpoiler(getSelection, setSelection) {
  wrapSelection(getSelection, setSelection, '||', '||', '숨김 내용');
}

export function insertTable(getSelection, setSelection) {
  insertAtCursor(getSelection, setSelection,
    '\n| 열1 | 열2 | 열3 |\n| --- | --- | --- |\n|  |  |  |\n');
}

export function insertChecklist(getSelection, setSelection) {
  insertAtCursor(getSelection, setSelection, '\n- [ ] 항목\n');
}

/**
 * Search Firestore docs for internal linking.
 * @param {{ db: any, fs: any }} firebase
 */
export async function searchInternalDocs({ db, fs }, query, limit = 12) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !db || !fs) return [];
  const results = [];
  const pushSnap = (snap, type, hrefFn, titleFn) => {
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const title = titleFn(d, doc.id);
      if (!title) return;
      if (q && !String(title).toLowerCase().includes(q) && !String(doc.id).toLowerCase().includes(q)) return;
      results.push({ type, id: doc.id, title, href: hrefFn(d, doc.id) });
    });
  };
  try {
    const [guides, announcements, patches, products] = await Promise.all([
      fs.getDocs(fs.query(fs.collection(db, 'guides'), fs.limit(40))),
      fs.getDocs(fs.query(fs.collection(db, 'announcements'), fs.limit(30))),
      fs.getDocs(fs.query(fs.collection(db, 'patchNotes'), fs.limit(30))),
      fs.getDocs(fs.query(fs.collection(db, 'productSections'), fs.limit(20))).catch(() => null)
    ]);
    pushSnap(guides, 'guide', (d) => `./guide/${encodeURIComponent(d.slug || '')}`, (d) => d.title || d.slug);
    pushSnap(announcements, 'notice', (_d, id) => `./notice.html?id=${encodeURIComponent(id)}`, (d) => d.title);
    pushSnap(patches, 'patch', (_d, id) => `./patch-note.html?id=${encodeURIComponent(id)}`, (d) => d.title || d.version);
    if (products) {
      pushSnap(products, 'product', () => './product.html', (d) => d.title);
    }
  } catch (e) {
    console.warn('internal doc search failed', e);
  }
  return results.slice(0, limit);
}

export async function promptInternalLink(getSelection, setSelection, searchFn) {
  const q = prompt('내부 문서 검색 (제목 일부):');
  if (q == null) return;
  const hits = await searchFn(q);
  if (!hits.length) {
    alert('검색 결과가 없습니다.');
    return;
  }
  const list = hits.map((h, i) => `${i + 1}) [${h.type}] ${h.title}`).join('\n');
  const pick = prompt(`${list}\n\n번호를 선택하세요:`, '1');
  const idx = Number(pick) - 1;
  if (!hits[idx]) return;
  const h = hits[idx];
  insertAtCursor(getSelection, setSelection, `[${h.title}](${h.href})`);
}

export function buildExtraToolbar(onAction) {
  const bar = document.createElement('div');
  bar.className = 'md-editor-toolbar-extra';
  const buttons = [
    ['alert', 'Alert'],
    ['spoiler', 'Spoiler'],
    ['checklist', '체크리스트'],
    ['table', '표'],
    ['image', '이미지'],
    ['video', '영상'],
    ['file', '파일'],
    ['internal', '내부링크'],
    ['step', ':::step'],
    ['tip', ':::tip'],
    ['faq', ':::faq']
  ];
  buttons.forEach(([action, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.dataset.mdAction = action;
    bar.appendChild(btn);
  });
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-md-action]');
    if (!btn) return;
    onAction(btn.dataset.mdAction);
  });
  return bar;
}

export function containerSnippet(type) {
  if (type === 'faq') return '\n:::faq\n질문\n답변\n:::\n';
  if (type === 'step') return '\n:::step 1단계\n내용\n:::\n';
  if (type === 'tip') return '\n:::tip\n팁 내용\n:::\n';
  return `\n:::${type}\n내용\n:::\n`;
}
