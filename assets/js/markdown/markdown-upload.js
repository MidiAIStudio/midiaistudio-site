/**
 * Image / video / file upload helpers for Markdown editor.
 * Uses Firebase Storage via visual-cms uploadToStorage when available,
 * or injected uploader.
 */

import { youtubeId } from './markdown-plugins.js';

function safeName(name) {
  return String(name || 'file').replace(/[^\w.\-()+]+/g, '_').slice(0, 120);
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

async function defaultUpload(path, file) {
  const { uploadToStorage } = await import('../visual-cms.js');
  return uploadToStorage(path, file);
}

/**
 * @param {object} opts
 * @param {string} opts.storagePrefix e.g. cms-md/uid/board
 * @param {(path:string,file:File)=>Promise<string>} [opts.upload]
 * @param {(md:string)=>void} opts.insertMarkdown
 * @param {(msg:string)=>void} [opts.onStatus]
 */
export function createMarkdownUploader({
  storagePrefix = 'cms-md/anon',
  upload = defaultUpload,
  insertMarkdown,
  onStatus
}) {
  const status = (m) => onStatus?.(m);

  async function uploadAndInsert(file, kind) {
    if (!file) return null;
    status(`업로드 중… ${file.name}`);
    const ts = Date.now();
    const path = `${storagePrefix.replace(/\/$/, '')}/${ts}_${safeName(file.name)}`;
    try {
      const url = await upload(path, file);
      const alt = file.name.replace(/\.[^.]+$/, '') || kind;
      let md = '';
      if (kind === 'image' || file.type.startsWith('image/')) {
        md = `![${alt}](${url})`;
      } else if (kind === 'video' || file.type.startsWith('video/')) {
        md = `\n![${alt}](${url})\n`;
      } else {
        md = `[📎 ${file.name}](${url})`;
      }
      insertMarkdown?.(md);
      status('업로드 완료');
      return url;
    } catch (e) {
      console.error(e);
      status(`업로드 실패: ${e.message || e}`);
      throw e;
    }
  }

  async function pickImage() {
    const file = await pickFile('image/jpeg,image/png,image/webp,image/gif');
    if (file) await uploadAndInsert(file, 'image');
  }

  async function pickVideo() {
    const choice = prompt('1) YouTube URL 삽입\n2) 영상 파일 업로드\n번호를 입력하세요:', '1');
    if (choice === '1') {
      const url = prompt('YouTube URL:');
      if (!url) return;
      if (!youtubeId(url)) {
        alert('유효한 YouTube URL이 아닙니다.');
        return;
      }
      insertMarkdown?.(`\n${url.trim()}\n`);
      return;
    }
    if (choice === '2') {
      const file = await pickFile('video/mp4,video/webm');
      if (file) await uploadAndInsert(file, 'video');
    }
  }

  async function pickFileAttach() {
    const file = await pickFile('.zip,.pdf,.exe,.mid,.midi,application/pdf,application/zip');
    if (file) await uploadAndInsert(file, 'file');
  }

  function bindPasteDrop(el) {
    if (!el) return () => {};
    const onPaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) await uploadAndInsert(file, 'image');
          return;
        }
      }
    };
    const onDragOver = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        el.classList.add('is-dragover');
      }
    };
    const onDragLeave = () => el.classList.remove('is-dragover');
    const onDrop = async (e) => {
      el.classList.remove('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      const kind = file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('video/') ? 'video' : 'file';
      await uploadAndInsert(file, kind);
    };
    el.addEventListener('paste', onPaste);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('paste', onPaste);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }

  return { pickImage, pickVideo, pickFileAttach, uploadAndInsert, bindPasteDrop };
}
