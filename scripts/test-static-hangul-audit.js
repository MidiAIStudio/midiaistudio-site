'use strict';
/**
 * Unit self-test for Hangul source classification (no jsdom dependency).
 * Notices Hangul ≠ FAIL; hero/nav Hangul = FAIL; notices-only → PASS.
 */
const assert = require('assert');
const { auditStaticHangul, HANGUL } = require('./static-locale-audit.js');

function makeEl(tag, attrs = {}, children = []) {
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    attributes: { ...attrs },
    childNodes: [],
    parentElement: null,
    className: attrs.class || '',
    id: attrs.id || '',
    textContent: '',
    closest(sel) {
      let cur = this;
      while (cur) {
        if (matchSel(cur, sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
  };
  for (const c of children) {
    if (typeof c === 'string') {
      const text = { nodeType: 3, nodeValue: c, parentElement: el };
      el.childNodes.push(text);
      el.textContent += c;
    } else {
      c.parentElement = el;
      el.childNodes.push(c);
      el.textContent += c.textContent || '';
    }
  }
  return el;
}

function matchSel(el, sel) {
  // Support simple "#id", ".class", "tag", "tag.class", "[attr]" (first compound only).
  const parts = sel.split(',').map((s) => s.trim());
  return parts.some((p) => matchOne(el, p));
}

function matchOne(el, sel) {
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  const attr = sel.match(/^\[([^\]=]+)\]$/);
  if (attr) return Object.prototype.hasOwnProperty.call(el.attributes, attr[1]);
  if (sel.startsWith('.')) {
    return String(el.className || '')
      .split(/\s+/)
      .includes(sel.slice(1));
  }
  const m = sel.match(/^([a-z0-9]+)?((?:\.[a-z0-9_-]+)*)$/i);
  if (!m) return false;
  const tag = m[1];
  const classes = (m[2] || '').split('.').filter(Boolean);
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  return classes.every((c) =>
    String(el.className || '')
      .split(/\s+/)
      .includes(c)
  );
}

function collectTextNodes(root, out = []) {
  for (const n of root.childNodes || []) {
    if (n.nodeType === 3) out.push(n);
    else if (n.nodeType === 1) collectTextNodes(n, out);
  }
  return out;
}

function makeDocument(bodyChildren) {
  const body = makeEl('body', {}, bodyChildren);
  const doc = {
    body,
    nodeType: 9,
    createTreeWalker(scope, _what, filter) {
      const nodes = collectTextNodes(scope).filter((n) => filter.acceptNode(n) === 1);
      let i = -1;
      return {
        currentNode: null,
        nextNode() {
          i += 1;
          if (i >= nodes.length) return null;
          this.currentNode = nodes[i];
          return this.currentNode;
        },
      };
    },
  };
  return doc;
}

function fixture({ withStaticKo }) {
  const navLink = makeEl('a', { 'data-nav': 'home' }, [withStaticKo ? '홈' : 'Home']);
  const nav = makeEl('nav', { id: 'mainNav' }, [navLink]);
  const header = makeEl('header', { class: 'topbar' }, [nav]);
  const hero = makeEl('section', { class: 'portal-hero' }, [
    makeEl('h1', {}, [withStaticKo ? '음원과 YouTube 음악을 AI로 MIDI로 변환' : 'Convert audio to MIDI']),
    makeEl('p', { class: 'portal-lead' }, [withStaticKo ? '한국어 리드 문구' : 'English lead']),
    makeEl('div', { class: 'portal-cta' }, [
      makeEl('a', { class: 'primary' }, [withStaticKo ? '라이선스 구매' : 'Buy license']),
    ]),
  ]);
  const updates = makeEl('div', { id: 'homeUpdates', 'data-i18n-skip': '1', class: 'portal-updates-card' }, [
    makeEl('strong', {}, ['공지: 서버 점검 안내']),
    makeEl('p', {}, ['내일 새벽 작업이 있습니다.']),
  ]);
  const patches = makeEl('div', { id: 'homePatches', 'data-i18n-skip': '1' }, [
    makeEl('p', {}, ['패치 1.2.3 출시']),
  ]);
  return makeDocument([header, hero, updates, patches]);
}

const r = auditStaticHangul(fixture({ withStaticKo: true }));
assert.ok(r.failCount >= 1, 'hero/nav Hangul must FAIL');
assert.ok(
  r.fail.some((f) => /음원|리드|홈|라이선스/.test(f.text)),
  'static UI Hangul present in fail[]'
);
assert.ok(
  r.dynamicOk.some((d) => /공지|패치|점검|출시/.test(d.text)),
  'CMS Hangul must be classified dynamic'
);
assert.ok(
  !r.fail.some((f) => /서버 점검|패치 1\.2\.3|내일 새벽/.test(f.text)),
  'notice/patch Hangul must NOT be in fail[]'
);
assert.ok(HANGUL.test('공지'), 'hangul regex ok');

const r2 = auditStaticHangul(fixture({ withStaticKo: false }));
assert.strictEqual(r2.failCount, 0, 'notices-only Hangul must PASS (failCount=0)');
assert.ok(r2.dynamicOk.length >= 1, 'dynamic Hangul still reported');
assert.ok(
  r2.dynamicOk.some((d) => /공지|패치/.test(d.text)),
  'notices remain in dynamicOk after static cleared'
);

console.log('PASS static_hangul_classification');
console.log(
  JSON.stringify(
    {
      withStaticKo: { failCount: r.failCount, dynamic: r.dynamicOk.length, fails: r.fail.map((f) => f.sel) },
      noticesOnly: { failCount: r2.failCount, dynamic: r2.dynamicOk.length },
    },
    null,
    2
  )
);
