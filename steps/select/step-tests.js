/**
 * Unit tests for the Select step.
 *
 * Covers:
 * - getSelectValue key fallback chain (variableKey → name → 'selectValue')
 * - personalInfo replacement logic
 * - Element tag filtering (only <select> elements)
 * - Native select value setting and change event
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

  function getSelectValue(row, variableKey, name) {
    return getRowValue(row, variableKey, name, 'selectValue');
  }

  function applyPersonalInfo(value, personalInfo) {
    if (!personalInfo || !personalInfo.length || value == null || value === '') return value;
    var trimmed = String(value).trim();
    var match = personalInfo.find(function (p) {
      return p.text && (String(value) === p.text || trimmed === (p.text || '').trim());
    });
    return (match && match.replacementWord) ? match.replacementWord : value;
  }

  function isSelectElement(tagName) {
    return (tagName || '').toLowerCase() === 'select';
  }

  runner.registerStepTests('select', [
    { name: 'getSelectValue from variableKey', fn: function () {
      runner.assertEqual(getSelectValue({ option: 'b' }, 'option'), 'b');
    }},
    { name: 'getSelectValue fallback to selectValue', fn: function () {
      runner.assertEqual(getSelectValue({ selectValue: 'x' }, null, null), 'x');
    }},
    { name: 'getSelectValue from name fallback', fn: function () {
      runner.assertEqual(getSelectValue({ country: 'US' }, null, 'country'), 'US');
    }},
    { name: 'getSelectValue empty row', fn: function () {
      runner.assertEqual(getSelectValue({}), '');
    }},
    { name: 'applyPersonalInfo replaces matching value', fn: function () {
      var pi = [{ text: 'California', replacementWord: '[state]' }];
      runner.assertEqual(applyPersonalInfo('California', pi), '[state]');
    }},
    { name: 'applyPersonalInfo no match', fn: function () {
      var pi = [{ text: 'California', replacementWord: '[state]' }];
      runner.assertEqual(applyPersonalInfo('Texas', pi), 'Texas');
    }},
    { name: 'applyPersonalInfo null value', fn: function () {
      runner.assertEqual(applyPersonalInfo(null, []), null);
    }},
    { name: 'CFS_personalInfoSync regex on matching select element', fn: function () {
      var S = global.CFS_personalInfoSync;
      if (!S || typeof S.applyToTypedValue !== 'function') {
        runner.assertTrue(false, 'CFS_personalInfoSync.applyToTypedValue not loaded');
        return;
      }
      var el = {};
      function resolveElement() {
        return el;
      }
      var pi = [
        {
          selectors: [{ type: 'id', value: '#country' }],
          mode: 'replaceRegexInElement',
          regex: '\\d{2}',
          replacementWord: 'XX',
        },
      ];
      runner.assertEqual(S.applyToTypedValue('US99', el, pi, resolveElement, {}), 'USXX');
    }},
    { name: 'isSelectElement accepts select', fn: function () {
      runner.assertTrue(isSelectElement('SELECT'));
      runner.assertTrue(isSelectElement('select'));
    }},
    { name: 'isSelectElement rejects other tags', fn: function () {
      runner.assertFalse(isSelectElement('INPUT'));
      runner.assertFalse(isSelectElement('DIV'));
      runner.assertFalse(isSelectElement(''));
    }},
    { name: 'select element value change fires event', fn: function () {
      var sel = document.createElement('select');
      var optA = document.createElement('option'); optA.value = 'a'; optA.textContent = 'A';
      var optB = document.createElement('option'); optB.value = 'b'; optB.textContent = 'B';
      sel.appendChild(optA);
      sel.appendChild(optB);
      var changed = false;
      sel.addEventListener('change', function () { changed = true; });
      sel.value = 'b';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      runner.assertEqual(sel.value, 'b');
      runner.assertTrue(changed);
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
