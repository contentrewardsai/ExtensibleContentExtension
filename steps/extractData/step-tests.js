/**
 * Unit tests for the Extract data step.
 *
 * Covers:
 * - buildExtractConfig normalization (fields, maxItems, selectors)
 * - Field array handling (defaults, with fields, invalid)
 * - maxItems validation
 * - DOM extraction simulation (querySelectorAll with fields)
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function buildExtractConfig(action) {
    return {
      listSelector: action.listSelector,
      itemSelector: action.itemSelector,
      fields: action.fields || [],
      maxItems: action.maxItems,
    };
  }

  function extractFromDom(doc, config) {
    var list = doc.querySelector(config.listSelector);
    if (!list) return { ok: false, rows: [], error: 'List not found' };
    var items = list.querySelectorAll(config.itemSelector);
    var rows = [];
    var limit = config.maxItems > 0 ? Math.min(items.length, config.maxItems) : items.length;
    for (var i = 0; i < limit; i++) {
      var row = {};
      for (var f = 0; f < config.fields.length; f++) {
        var field = config.fields[f];
        var el = items[i].querySelector(field.selector);
        row[field.key] = el ? (el.textContent || '').trim() : '';
      }
      rows.push(row);
    }
    return { ok: true, rows: rows };
  }

  runner.registerStepTests('extractData', [
    { name: 'buildExtractConfig defaults', fn: function () {
      var cfg = buildExtractConfig({ listSelector: '.list', itemSelector: '.item' });
      runner.assertEqual(cfg.listSelector, '.list');
      runner.assertEqual(cfg.itemSelector, '.item');
      runner.assertDeepEqual(cfg.fields, []);
      runner.assertEqual(cfg.maxItems, undefined);
    }},
    { name: 'buildExtractConfig with fields', fn: function () {
      var fields = [{ key: 'name', selector: '.name' }, { key: 'email', selector: '.email' }];
      var cfg = buildExtractConfig({ listSelector: 'ul', itemSelector: 'li', fields: fields, maxItems: 10 });
      runner.assertEqual(cfg.fields.length, 2);
      runner.assertEqual(cfg.fields[0].key, 'name');
      runner.assertEqual(cfg.maxItems, 10);
    }},
    { name: 'buildExtractConfig missing fields defaults to empty array', fn: function () {
      var cfg = buildExtractConfig({ listSelector: 'div' });
      runner.assertDeepEqual(cfg.fields, []);
    }},
    { name: 'extractFromDom basic extraction', fn: function () {
      var container = document.createElement('div');
      container.innerHTML = '<ul class="list"><li class="item"><span class="name">Alice</span></li><li class="item"><span class="name">Bob</span></li></ul>';
      var result = extractFromDom(container, {
        listSelector: '.list',
        itemSelector: '.item',
        fields: [{ key: 'name', selector: '.name' }],
      });
      runner.assertTrue(result.ok);
      runner.assertEqual(result.rows.length, 2);
      runner.assertEqual(result.rows[0].name, 'Alice');
      runner.assertEqual(result.rows[1].name, 'Bob');
    }},
    { name: 'extractFromDom maxItems limits results', fn: function () {
      var container = document.createElement('div');
      container.innerHTML = '<ul class="list"><li class="item">A</li><li class="item">B</li><li class="item">C</li></ul>';
      var result = extractFromDom(container, {
        listSelector: '.list',
        itemSelector: '.item',
        fields: [],
        maxItems: 2,
      });
      runner.assertEqual(result.rows.length, 2);
    }},
    { name: 'extractFromDom list not found returns error', fn: function () {
      var container = document.createElement('div');
      var result = extractFromDom(container, {
        listSelector: '.nonexistent',
        itemSelector: '.item',
        fields: [],
      });
      runner.assertFalse(result.ok);
      runner.assertTrue(result.error.indexOf('not found') >= 0);
    }},
    { name: 'extractFromDom multi-field extraction', fn: function () {
      var container = document.createElement('div');
      container.innerHTML = '<div class="table"><div class="row"><span class="n">X</span><span class="v">1</span></div></div>';
      var result = extractFromDom(container, {
        listSelector: '.table',
        itemSelector: '.row',
        fields: [{ key: 'name', selector: '.n' }, { key: 'value', selector: '.v' }],
      });
      runner.assertEqual(result.rows[0].name, 'X');
      runner.assertEqual(result.rows[0].value, '1');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
