/**
 * Parse generator template inputSchema from ShotStack template JSON (__CFS_INPUT_SCHEMA merge entry).
 * Used by the Run generator workflow step UI (side panel) and unit tests.
 */
(function (global) {
  'use strict';

  var CFS_META_PREFIX = '__CFS_';

  /**
   * @param {object} templateObj - Parsed template.json root
   * @returns {{ inputSchema: Array, error: string|null }}
   */
  function parseInputSchemaFromTemplateObject(templateObj) {
    if (!templateObj || typeof templateObj !== 'object') {
      return { inputSchema: [], error: null };
    }
    var merge = templateObj.merge;
    if (!Array.isArray(merge)) {
      return { inputSchema: [], error: null };
    }
    for (var i = 0; i < merge.length; i++) {
      var m = merge[i];
      if (!m) continue;
      var key = m.find != null ? String(m.find) : '';
      if (key.indexOf(CFS_META_PREFIX) !== 0) continue;
      var suffix = key.slice(CFS_META_PREFIX.length);
      if (suffix !== 'INPUT_SCHEMA') continue;
      try {
        var parsed = JSON.parse(m.replace);
        var arr = Array.isArray(parsed) ? parsed : [];
        return { inputSchema: arr, error: null };
      } catch (e) {
        return { inputSchema: [], error: (e && e.message) || 'Invalid __CFS_INPUT_SCHEMA JSON' };
      }
    }
    return { inputSchema: [], error: null };
  }

  /**
   * @param {string} text - Raw template.json text
   * @returns {{ inputSchema: Array, error: string|null }}
   */
  function parseInputSchemaFromTemplateJsonText(text) {
    if (text == null || String(text).trim() === '') {
      return { inputSchema: [], error: 'Empty template' };
    }
    try {
      var o = JSON.parse(text);
      return parseInputSchemaFromTemplateObject(o);
    } catch (e) {
      return { inputSchema: [], error: (e && e.message) || 'Invalid template JSON' };
    }
  }

  /**
   * Default mapping suggestion for a schema field (workflow row variable pattern).
   * @param {{ id?: string, mergeField?: string }} field
   * @param {string|undefined} existing - Current inputMap value if any
   * @returns {string}
   */
  function suggestInputMapValue(field, existing) {
    if (existing != null && String(existing).trim() !== '') return String(existing);
    var mf = field && field.mergeField != null ? String(field.mergeField).trim() : '';
    if (mf) return '{{' + mf + '}}';
    var id = field && field.id != null ? String(field.id).trim() : '';
    if (id) return '{{' + id + '}}';
    return '';
  }

  global.__CFS_parseGeneratorTemplateInputSchema = {
    parseFromTemplateObject: parseInputSchemaFromTemplateObject,
    parseFromTemplateJsonText: parseInputSchemaFromTemplateJsonText,
    suggestInputMapValue: suggestInputMapValue,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
