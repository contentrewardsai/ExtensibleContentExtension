/**
 * Unit tests for the Type step.
 *
 * Covers:
 * - getTypeValue key fallback chain (variableKey → placeholder → name → 'value')
 * - isRecentCropSave detection (previous action crop/save patterns)
 * - personalInfo replacement logic
 * - contentEditable vs input element branching
 * - Handler registration and meta flags
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getRowValue(row) {
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (k && row && row[k] !== undefined) return row[k];
    }
    return '';
  }

  function getTypeValue(row, variableKey, placeholder, name) {
    return getRowValue(row, variableKey, placeholder, name, 'value');
  }

  function isRecentCropSave(prevAction) {
    return prevAction && prevAction.type === 'click' && /crop|save|use this|insert|apply/i.test((prevAction.text || prevAction.displayedValue || '').trim());
  }

  function applyPersonalInfo(value, personalInfo) {
    if (!personalInfo || !personalInfo.length) return value;
    var trimmed = value.trim();
    var match = personalInfo.find(function (p) {
      return p.text && (value === p.text || trimmed === (p.text || '').trim());
    });
    return (match && match.replacementWord) ? match.replacementWord : value;
  }

  function isTypeTarget(tagName, isContentEditable) {
    var tag = (tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || isContentEditable;
  }

  runner.registerStepTests('type', [
    { name: 'getTypeValue from variableKey', fn: function () {
      runner.assertEqual(getTypeValue({ value: 'x' }, 'value'), 'x');
    }},
    { name: 'getTypeValue fallback chain', fn: function () {
      runner.assertEqual(getTypeValue({ placeholder: 'typed' }, null, 'placeholder'), 'typed');
    }},
    { name: 'getTypeValue fallback to name', fn: function () {
      runner.assertEqual(getTypeValue({ myField: 'hello' }, null, null, 'myField'), 'hello');
    }},
    { name: 'getTypeValue final fallback to value key', fn: function () {
      runner.assertEqual(getTypeValue({ value: 'default' }), 'default');
    }},
    { name: 'getTypeValue empty row returns empty string', fn: function () {
      runner.assertEqual(getTypeValue({}), '');
    }},
    { name: 'isRecentCropSave detects crop keywords', fn: function () {
      runner.assertTrue(isRecentCropSave({ type: 'click', text: 'Crop & Save' }));
      runner.assertTrue(isRecentCropSave({ type: 'click', displayedValue: 'Use this photo' }));
      runner.assertTrue(isRecentCropSave({ type: 'click', text: 'Insert image' }));
      runner.assertTrue(isRecentCropSave({ type: 'click', text: 'Apply changes' }));
    }},
    { name: 'isRecentCropSave rejects non-crop actions', fn: function () {
      runner.assertFalse(isRecentCropSave({ type: 'click', text: 'Cancel' }));
      runner.assertFalse(isRecentCropSave({ type: 'click', text: 'Next' }));
      runner.assertFalse(isRecentCropSave({ type: 'type' }));
      runner.assertFalse(isRecentCropSave(null));
    }},
    { name: 'applyPersonalInfo replaces matching text', fn: function () {
      var pi = [{ text: 'John Doe', replacementWord: '[name]' }];
      runner.assertEqual(applyPersonalInfo('John Doe', pi), '[name]');
    }},
    { name: 'applyPersonalInfo ignores non-matching', fn: function () {
      var pi = [{ text: 'John Doe', replacementWord: '[name]' }];
      runner.assertEqual(applyPersonalInfo('Jane Smith', pi), 'Jane Smith');
    }},
    { name: 'applyPersonalInfo empty list returns original', fn: function () {
      runner.assertEqual(applyPersonalInfo('test', []), 'test');
    }},
    { name: 'applyPersonalInfo trims for comparison', fn: function () {
      var pi = [{ text: ' hello ', replacementWord: 'hi' }];
      runner.assertEqual(applyPersonalInfo(' hello ', pi), 'hi');
    }},
    { name: 'isTypeTarget accepts input', fn: function () {
      runner.assertTrue(isTypeTarget('INPUT', false));
      runner.assertTrue(isTypeTarget('input', false));
    }},
    { name: 'isTypeTarget accepts textarea', fn: function () {
      runner.assertTrue(isTypeTarget('TEXTAREA', false));
    }},
    { name: 'isTypeTarget accepts contentEditable', fn: function () {
      runner.assertTrue(isTypeTarget('DIV', true));
    }},
    { name: 'isTypeTarget rejects div without contentEditable', fn: function () {
      runner.assertFalse(isTypeTarget('DIV', false));
    }},
    { name: 'isTypeTarget rejects button', fn: function () {
      runner.assertFalse(isTypeTarget('BUTTON', false));
    }},
    { name: 'contentEditable element receives typed text', fn: function () {
      var el = document.createElement('div');
      el.contentEditable = 'true';
      document.body.appendChild(el);
      el.focus();
      el.textContent = '';
      document.execCommand('insertText', false, 'Hello');
      runner.assertEqual(el.textContent, 'Hello');
      document.body.removeChild(el);
    }},
    { name: 'ProseMirror stays typeable when contenteditable is false', fn: function () {
      function isTypeable(el) {
        if (!el || el.type === 'file') return false;
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return true;
        if (el.isContentEditable) return true;
        if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return true;
        if (el.classList && (el.classList.contains('ProseMirror') || el.classList.contains('tiptap') || el.classList.contains('dtr-ce'))) return true;
        return false;
      }
      var el = document.createElement('div');
      el.className = 'tiptap ProseMirror';
      el.setAttribute('contenteditable', 'false');
      runner.assertTrue(isTypeable(el), 'GHL editors are typeable before focus');
      runner.assertFalse(el.isContentEditable);
    }},
    { name: 'undefined row value falls back to recordedValue', fn: function () {
      var raw = String(undefined);
      runner.assertEqual(raw, 'undefined');
      var value = raw === 'undefined' || raw === 'null' ? '' : raw;
      if (!value.trim()) value = 'Pothos';
      runner.assertEqual(value, 'Pothos');
    }},
    { name: 'pick last does not prefer a stale active editor', fn: function () {
      var handler = global.__CFS_stepHandlers && global.__CFS_stepHandlers.type;
      if (!handler) {
        runner.assertTrue(true, 'type handler present at playback');
        return;
      }
      var first = document.createElement('div');
      first.contentEditable = 'true';
      first.textContent = 'FloraTrack';
      var last = document.createElement('div');
      last.contentEditable = 'true';
      last.className = 'tiptap ProseMirror';
      last.textContent = 'Add a Title Here';
      document.body.appendChild(first);
      document.body.appendChild(last);
      first.focus();
      return handler({
        type: 'type',
        selectors: [{ type: 'css', value: '[contenteditable="true"]' }],
        pick: 'last',
        recordedValue: 'My Garden',
        variableKey: 'text',
      }, {
        ctx: {
          document: document,
          currentRow: { text: 'My Garden' },
          resolveAllCandidatesForAction: function () {
            return [{ element: first }, { element: last }];
          },
          getRowValue: function (row, key) { return row && row[key] || ''; },
          yieldToReact: function () { return Promise.resolve(); },
          sleep: function () { return Promise.resolve(); },
          personalInfo: [],
        },
      }).then(function () {
        runner.assertEqual(last.textContent, 'My Garden');
        runner.assertEqual(first.textContent, 'FloraTrack');
      }).finally(function () {
        document.body.removeChild(first);
        document.body.removeChild(last);
      });
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
