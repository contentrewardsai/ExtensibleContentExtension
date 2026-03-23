/**
 * Visible text / value capture for recorded "type" steps (input/textarea vs contenteditable).
 * Loaded before content/recorder.js in the manifest.
 */
function getRecordedTypingValue(el) {
  if (!el || el.nodeType !== 1) return '';
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return el.value == null ? '' : String(el.value);
  if (el.isContentEditable) {
    const t = el.innerText != null ? el.innerText : el.textContent || '';
    return String(t).replace(/\r\n/g, '\n');
  }
  return el.value != null && el.value !== '' ? String(el.value) : el.textContent || '';
}

if (typeof window !== 'undefined') {
  window.CFS_recordingValue = window.CFS_recordingValue || {};
  window.CFS_recordingValue.getRecordedTypingValue = getRecordedTypingValue;
}
