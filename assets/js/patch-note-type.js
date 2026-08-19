export function patchNoteType(item){
  const t = String(item?.type || '').trim().toLowerCase();
  if(t === 'web') return 'web';
  if(t === 'app') return 'app';
  return String(item?.version || '').trim() ? 'app' : 'web';
}

export function patchNoteVersion(item){
  if(patchNoteType(item) !== 'app') return '';
  return String(item?.version || '').trim();
}

export function patchNoteWriteFields(data){
  const type = data?.type === 'web' ? 'web' : 'app';
  const version = String(data?.version || '').trim();
  if(type === 'app' && !version) return { ok:false, error:'version-required', type };
  const fields = { type };
  if(type === 'app') fields.version = version;
  return { ok:true, type, fields };
}

export function patchNoteSearchHay(item){
  const type = patchNoteType(item);
  const version = patchNoteVersion(item);
  return [type, type.toUpperCase(), version ? `v${version}` : '', version, item?.title || '', item?.content || ''].join(' ');
}
