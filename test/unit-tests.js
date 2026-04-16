/**
 * Unit tests for shared modules. Uses CFS_unitTestRunner (assertEqual, assertDeepEqual, assertTrue, assertFalse).
 */
(function (global) {
  'use strict';

  var assertEqual = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertEqual;
  var assertDeepEqual = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertDeepEqual;
  var assertTrue = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertTrue;
  var assertFalse = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertFalse;

  if (!assertEqual || !assertDeepEqual) {
    throw new Error('Unit test runner not loaded');
  }

  /** Step validator */
  function testStepValidatorValid() {
    var v = global.CFS_stepValidator && global.CFS_stepValidator.validateStepDefinition;
    if (!v) throw new Error('CFS_stepValidator not loaded');
    var r = v({ id: 'click', label: 'Click', defaultAction: { type: 'click' } }, 'click');
    assertTrue(r.valid, 'valid step');
    assertEqual(r.errors.length, 0);
  }

  function testStepValidatorMissingId() {
    var v = global.CFS_stepValidator.validateStepDefinition;
    var r = v({ label: 'Click', defaultAction: { type: 'click' } });
    assertFalse(r.valid);
    assertTrue(r.errors.some(function (e) { return e.indexOf('id') >= 0; }));
  }

  function testStepValidatorIdMismatch() {
    var v = global.CFS_stepValidator.validateStepDefinition;
    var r = v({ id: 'type', label: 'Type', defaultAction: { type: 'type' } }, 'click');
    assertFalse(r.valid);
    assertTrue(r.errors.some(function (e) { return e.indexOf('match') >= 0; }));
  }

  function testStepValidatorDefaultActionMismatch() {
    var v = global.CFS_stepValidator.validateStepDefinition;
    var r = v({ id: 'click', label: 'Click', defaultAction: { type: 'type' } });
    assertFalse(r.valid);
  }

  /** Step comment */
  function testStepCommentSummary() {
    var s = global.CFS_stepComment && global.CFS_stepComment.getStepCommentSummary;
    if (!s) throw new Error('CFS_stepComment not loaded');
    assertEqual(s({ text: 'Hello' }), 'Hello');
    assertEqual(s({ text: 'Hi' }, 2), 'Hi');
    assertEqual(s({ text: 'Hello world' }, 5), 'Hello…');
    assertEqual(s(null), '');
    assertEqual(s({}), '');
  }

  function testStepCommentParts() {
    var p = global.CFS_stepComment.getStepCommentParts;
    assertDeepEqual(p(null), []);
    assertDeepEqual(p({}), []);
    assertDeepEqual(p({ text: 'x' }), [{ type: 'text', content: 'x' }]);
    assertDeepEqual(p({ text: 'a', mediaOrder: ['text', 'images'] }), [{ type: 'text', content: 'a' }]);
  }

  /** Book builder */
  function testBookBuilderGetStepCaption() {
    var g = global.__CFS_bookBuilder && global.__CFS_bookBuilder.getStepCaption;
    if (!g) throw new Error('__CFS_bookBuilder not loaded');
    assertEqual(g({ comment: { text: 'Foo' } }, 0), 'Foo');
    assertEqual(g({ stepLabel: 'Bar' }, 1), 'Bar');
    assertEqual(g({ type: 'click' }, 2), 'click 3');
  }

  function testBookBuilderGetStepBody() {
    var g = global.__CFS_bookBuilder.getStepBody;
    assertEqual(g({ comment: { text: 'Body text' } }), 'Body text');
    assertEqual(g({ type: 'click' }), '');
  }

  /** Walkthrough export */
  function testWalkthroughSelectorStrings() {
    var sel = global.CFS_walkthroughExport && global.CFS_walkthroughExport.selectorStrings;
    if (!sel) throw new Error('CFS_walkthroughExport not loaded');
    assertDeepEqual(sel(null), []);
    assertDeepEqual(sel({}), []);
    assertDeepEqual(sel({ selectors: ['#id', '.cls'] }), ['#id', '.cls']);
    assertDeepEqual(sel({ selectors: [{ value: '.btn' }] }), ['.btn']);
  }

  function testWalkthroughBuildConfig() {
    var b = global.CFS_walkthroughExport.buildWalkthroughConfig;
    var cfg = b({ name: 'Test', id: 'x', analyzed: { actions: [{ type: 'click', comment: { text: 'Click here' } }] } });
    assertEqual(cfg.name, 'Test');
    assertEqual(cfg.workflowId, 'x');
    assertEqual(cfg.steps.length, 1);
    assertEqual(cfg.steps[0].tooltip, 'Click here');
  }

  /** Analyzer */
  function testAnalyzerNormalStepType() {
    var n = global.normalStepType;
    if (!n) throw new Error('analyzer not loaded');
    assertEqual(n('mouseover'), 'hover');
    assertEqual(n('mouseenter'), 'hover');
    assertEqual(n('click'), 'click');
    assertEqual(n(''), '');
    assertEqual(n(null), '');
  }

  function testAnalyzerUrlToCaptureContext() {
    var u = global.urlToCaptureContext;
    if (!u) throw new Error('analyzer not loaded');
    assertDeepEqual(u('https://example.com/path'), { domain: 'example.com', page_slug: 'path' });
    assertDeepEqual(u('https://sub.example.com/a/b'), { domain: 'sub.example.com', page_slug: 'a_b' });
    assertEqual(u('chrome://extensions'), undefined);
    assertEqual(u('about:blank'), undefined);
    assertEqual(u(null), undefined);
    assertEqual(u(''), undefined);
  }

  function testAnalyzerMergeSelectors() {
    var m = global.mergeSelectors;
    if (!m) throw new Error('analyzer not loaded');
    var sel = [{ type: 'id', value: '#x', score: 10 }, { type: 'id', value: '#x', score: 8 }];
    var out = m(sel);
    assertEqual(out.length, 1);
    assertEqual(out[0].score, 10);
  }

  function testAnalyzerMergeFallbackTexts() {
    var m = global.mergeFallbackTexts;
    if (!m) throw new Error('analyzer not loaded');
    assertDeepEqual(m(['foo', 'foo', 'bar']), ['foo', 'bar']);
    assertDeepEqual(m([]), []);
  }

  /** Selectors */
  function testSelectorsDecodeSelectorValue() {
    var d = global.CFS_selectors && global.CFS_selectors.decodeSelectorValue;
    if (!d) throw new Error('CFS_selectors not loaded');
    assertEqual(d('&gt;'), '>');
    assertEqual(d('a&amp;b'), 'a&b');
    assertEqual(d('plain'), 'plain');
  }

  function testSelectorsScoreSelectorString() {
    var s = global.CFS_selectors && global.CFS_selectors.scoreSelectorString;
    if (!s) throw new Error('CFS_selectors not loaded');
    var r = s('[data-testid="btn"]');
    assertTrue(r.score >= 8);
    assertEqual(r.label, 'Stable');
    var r2 = s('#myId');
    assertTrue(r2.score >= 7, 'semantic #id scores 7 in scoreSelectorString');
    assertEqual(r2.label, 'Likely stable');
  }

  /** Template resolver */
  function testTemplateResolverBasic() {
    var r = global.CFS_templateResolver && global.CFS_templateResolver.resolveTemplate;
    if (!r) throw new Error('CFS_templateResolver not loaded');
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    assertEqual(r('Hello {{name}}', { name: 'World' }, getRow), 'Hello World');
  }

  function testTemplateResolverStepComment() {
    var r = global.CFS_templateResolver.resolveTemplate;
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    var action = { comment: { text: 'Step text here' } };
    assertEqual(r('{{stepCommentText}}', {}, getRow, action), 'Step text here');
    var actionItems = { comment: { items: [{ id: 'a', type: 'text', text: 'One' }, { id: 'b', type: 'text', text: 'Two' }] } };
    assertEqual(r('{{stepCommentText}}', {}, getRow, actionItems), 'One\n\nTwo');
  }

  function testTemplateResolverStepCommentSummaryTruncation() {
    var r = global.CFS_templateResolver.resolveTemplate;
    function getRow() { return ''; }
    var long = 'a'.repeat(150);
    var action = { comment: { text: long } };
    var out = r('{{stepCommentSummary}}', {}, getRow, action);
    assertEqual(out.length, 121);
    assertTrue(out.endsWith('\u2026'));
  }

  function testTemplateResolverGetByPath() {
    var g = global.CFS_templateResolver.getByPath;
    assertEqual(g({ a: { b: 1 } }, 'a.b'), 1);
    assertEqual(g({}, 'x'), undefined);
    assertEqual(g({ a: 1 }, 'a'), 1);
    assertEqual(g({ a: { b: { c: 2 } } }, 'a.b.c'), 2);
  }

  function testTemplateResolverMissingVar() {
    var r = global.CFS_templateResolver.resolveTemplate;
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    assertEqual(r('Hello {{missing}}', {}, getRow), 'Hello ');
  }

  function testTemplateResolverNullInput() {
    var r = global.CFS_templateResolver.resolveTemplate;
    function getRow() { return ''; }
    assertEqual(r(null, {}, getRow), '');
  }

  /** Bug A: sendToEndpoint fallback resolveTemplate must have valid syntax (was missing closing paren) */
  function testSendToEndpointFallbackResolveTemplate() {
    var fallbackResolveTemplate = function(str, row, getRowValue, action) {
      if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
      return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
        var k = key.trim();
        if (action && k === 'stepCommentText') {
          var c = action && action.comment ? action.comment : {};
          var pts = [];
          if (Array.isArray(c.items)) {
            for (var ii = 0; ii < c.items.length; ii++) {
              var z = c.items[ii];
              if (z && z.type === 'text' && z.text != null && String(z.text).trim()) pts.push(String(z.text).trim());
            }
          }
          if (pts.length) return pts.join('\n\n');
          return (c.text != null && String(c.text).trim()) ? String(c.text) : '';
        }
        if (action && k === 'stepCommentSummary') {
          var c3 = action && action.comment ? action.comment : {};
          var sg = [];
          if (Array.isArray(c3.items)) {
            for (var jj = 0; jj < c3.items.length; jj++) {
              var z2 = c3.items[jj];
              if (z2 && z2.type === 'text' && z2.text != null && String(z2.text).trim()) sg.push(String(z2.text).trim());
            }
          }
          var tx = sg.length ? sg.join('\n\n') : String(c3.text || '').trim();
          return tx.length > 120 ? tx.slice(0, 120) + '\u2026' : tx;
        }
        var v = getRowValue(row, k);
        return v != null ? String(v) : '';
      });
    };
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : undefined; }
    assertEqual(fallbackResolveTemplate('Hello {{name}}', { name: 'World' }, getRow), 'Hello World');
    assertEqual(fallbackResolveTemplate('No vars', {}, getRow), 'No vars');
    assertEqual(fallbackResolveTemplate('{{missing}}', {}, getRow), '');
    assertEqual(fallbackResolveTemplate(null, {}, getRow), '');
    var action = { comment: { text: 'My comment' } };
    assertEqual(fallbackResolveTemplate('{{stepCommentText}}', {}, getRow, action), 'My comment');
  }

  /** Bug B: shouldRunRecurring monthly — must NOT match every day when dayOfMonth is null */
  function testShouldRunRecurringMonthlyWithoutDay() {
    function shouldRunRecurring(schedule, nowInZone) {
      var time = (schedule.time || '00:00').trim();
      var parts = time.split(':');
      var schedHour = parseInt(parts[0], 10) || 0;
      var schedMin = parseInt(parts[1], 10) || 0;
      if (nowInZone.hour !== schedHour || nowInZone.minute !== schedMin) return false;
      var pattern = (schedule.pattern || 'daily').toLowerCase();
      var lastRun = schedule.lastRunAt || '';
      if (lastRun === nowInZone.dateStr) return false;
      if (pattern === 'daily') return true;
      if (pattern === 'monthly') return (schedule.dayOfMonth != null ? Number(schedule.dayOfMonth) : 1) === nowInZone.dayOfMonth;
      return true;
    }
    var now15 = { hour: 9, minute: 0, dayOfMonth: 15, month: 3, dateStr: '2026-03-15' };
    var now1 = { hour: 9, minute: 0, dayOfMonth: 1, month: 3, dateStr: '2026-03-01' };
    var scheduleNoDay = { pattern: 'monthly', time: '09:00' };
    assertFalse(shouldRunRecurring(scheduleNoDay, now15), 'monthly without dayOfMonth should not run on day 15');
    assertTrue(shouldRunRecurring(scheduleNoDay, now1), 'monthly without dayOfMonth should default to day 1');
    var scheduleDay15 = { pattern: 'monthly', time: '09:00', dayOfMonth: 15 };
    assertTrue(shouldRunRecurring(scheduleDay15, now15), 'monthly with dayOfMonth=15 should run on day 15');
    assertFalse(shouldRunRecurring(scheduleDay15, now1), 'monthly with dayOfMonth=15 should not run on day 1');
  }

  /** Bug B: shouldRunRecurring yearly — must NOT match every day when month/dayOfMonth are null */
  function testShouldRunRecurringYearlyWithoutMonthDay() {
    function shouldRunRecurring(schedule, nowInZone) {
      var time = (schedule.time || '00:00').trim();
      var parts = time.split(':');
      var schedHour = parseInt(parts[0], 10) || 0;
      var schedMin = parseInt(parts[1], 10) || 0;
      if (nowInZone.hour !== schedHour || nowInZone.minute !== schedMin) return false;
      var pattern = (schedule.pattern || 'daily').toLowerCase();
      var lastRun = schedule.lastRunAt || '';
      if (lastRun === nowInZone.dateStr) return false;
      if (pattern === 'yearly') {
        var monthDay = schedule.monthDay;
        if (monthDay) {
          var md = String(monthDay).split('/');
          var m = parseInt(md[0], 10);
          var d = parseInt(md[1], 10);
          return m === nowInZone.month && d === nowInZone.dayOfMonth;
        }
        return (schedule.month != null ? Number(schedule.month) : 1) === nowInZone.month &&
               (schedule.dayOfMonth != null ? Number(schedule.dayOfMonth) : 1) === nowInZone.dayOfMonth;
      }
      return true;
    }
    var nowJan1 = { hour: 10, minute: 0, dayOfMonth: 1, month: 1, dateStr: '2026-01-01' };
    var nowMar15 = { hour: 10, minute: 0, dayOfMonth: 15, month: 3, dateStr: '2026-03-15' };
    var scheduleNoMonthDay = { pattern: 'yearly', time: '10:00' };
    assertTrue(shouldRunRecurring(scheduleNoMonthDay, nowJan1), 'yearly without month/day should default to Jan 1');
    assertFalse(shouldRunRecurring(scheduleNoMonthDay, nowMar15), 'yearly without month/day should not run on Mar 15');
    var scheduleWithMonthDay = { pattern: 'yearly', time: '10:00', monthDay: '3/15' };
    assertTrue(shouldRunRecurring(scheduleWithMonthDay, nowMar15), 'yearly with monthDay=3/15 should run on Mar 15');
    assertFalse(shouldRunRecurring(scheduleWithMonthDay, nowJan1), 'yearly with monthDay=3/15 should not run on Jan 1');
  }

  /** Bug D: video-combiner audio track endTime — Number(undefined) != null is always true */
  function testVideoCombinerEndTimeCondition() {
    function computeEndTime(endTimeRaw) {
      return endTimeRaw != null && endTimeRaw !== '' ? Number(endTimeRaw) : null;
    }
    assertEqual(computeEndTime(undefined), null, 'undefined endTime should be null');
    assertEqual(computeEndTime(null), null, 'null endTime should be null');
    assertEqual(computeEndTime(''), null, 'empty string endTime should be null');
    assertEqual(computeEndTime(5), 5, 'numeric endTime should pass through');
    assertEqual(computeEndTime('10'), 10, 'string numeric endTime should be parsed');
    assertEqual(computeEndTime(0), 0, 'zero endTime should be 0');

    function computeEndTimeBuggy(endTimeRaw) {
      return Number(endTimeRaw) != null && endTimeRaw !== '' ? Number(endTimeRaw) : null;
    }
    var buggyResult = computeEndTimeBuggy(undefined);
    assertTrue(isNaN(buggyResult), 'buggy version returns NaN for undefined instead of null');
  }
  /** getNowInTimezone: returns expected shape */
  function testGetNowInTimezoneShape() {
    function getNowInTimezone(tz) {
      var d = new Date();
      var opts = { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
      var parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
      var get = function(type) { return (parts.find(function(p) { return p.type === type; }) || {}).value || '0'; };
      var month = parseInt(get('month'), 10);
      var day = parseInt(get('day'), 10);
      var year = get('year');
      var hour = parseInt(get('hour'), 10);
      var minute = parseInt(get('minute'), 10);
      var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var dayOfWeek = new Date(Date.UTC(parseInt(year, 10), month - 1, day)).getUTCDay();
      return { dateStr: dateStr, hour: hour, minute: minute, dayOfWeek: dayOfWeek, dayOfMonth: day, month: month };
    }
    var utc = getNowInTimezone('UTC');
    assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(utc.dateStr), 'dateStr format');
    assertTrue(typeof utc.hour === 'number' && utc.hour >= 0 && utc.hour <= 23, 'hour range');
    assertTrue(typeof utc.minute === 'number' && utc.minute >= 0 && utc.minute <= 59, 'minute range');
    assertTrue(typeof utc.dayOfWeek === 'number' && utc.dayOfWeek >= 0 && utc.dayOfWeek <= 6, 'dayOfWeek range');
    assertTrue(typeof utc.dayOfMonth === 'number' && utc.dayOfMonth >= 1 && utc.dayOfMonth <= 31, 'dayOfMonth range');
    assertTrue(typeof utc.month === 'number' && utc.month >= 1 && utc.month <= 12, 'month range');

    var et = getNowInTimezone('America/New_York');
    assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(et.dateStr), 'ET dateStr format');
  }

  /** Interval recurring: missing lastRunAtMs must still run (legacy/imported rows otherwise never fire). */
  function testShouldRunRecurringIntervalFirstRun() {
    function shouldRunRecurringInterval(schedule, nowMs) {
      var pattern = (schedule.pattern || 'daily').toLowerCase();
      if (pattern !== 'interval') return null;
      var mins = Math.max(1, parseInt(schedule.intervalMinutes, 10) || 1);
      var intervalMs = mins * 60 * 1000;
      var last = schedule.lastRunAtMs != null ? Number(schedule.lastRunAtMs) : 0;
      if (!last || last <= 0) return true;
      if ((nowMs - last) < intervalMs) return false;
      return true;
    }
    var t0 = 1700000000000;
    assertTrue(
      shouldRunRecurringInterval({ pattern: 'interval', intervalMinutes: 5 }, t0),
      'interval without lastRunAtMs should run on first check'
    );
    assertTrue(
      shouldRunRecurringInterval({ pattern: 'interval', intervalMinutes: 5, lastRunAtMs: 0 }, t0),
      'interval with lastRunAtMs 0 should run'
    );
    assertFalse(
      shouldRunRecurringInterval({ pattern: 'interval', intervalMinutes: 5, lastRunAtMs: t0 - 60000 }, t0),
      'interval should not run before interval elapses'
    );
    assertTrue(
      shouldRunRecurringInterval({ pattern: 'interval', intervalMinutes: 5, lastRunAtMs: t0 - 6 * 60000 }, t0),
      'interval should run after interval elapses'
    );
  }

  /** shouldRunRecurring: weekly pattern with array of days */
  function testShouldRunRecurringWeeklyArray() {
    function shouldRunRecurring(schedule, nowInZone) {
      var time = (schedule.time || '00:00').trim();
      var parts = time.split(':');
      var schedHour = parseInt(parts[0], 10) || 0;
      var schedMin = parseInt(parts[1], 10) || 0;
      if (nowInZone.hour !== schedHour || nowInZone.minute !== schedMin) return false;
      var pattern = (schedule.pattern || 'daily').toLowerCase();
      var lastRun = schedule.lastRunAt || '';
      if (lastRun === nowInZone.dateStr) return false;
      if (pattern === 'daily') return true;
      if (pattern === 'weekly') {
        var days = schedule.dayOfWeek;
        if (!Array.isArray(days) && days != null) return Number(days) === nowInZone.dayOfWeek;
        return Array.isArray(days) && days.some(function(d) { return Number(d) === nowInZone.dayOfWeek; });
      }
      if (pattern === 'monthly') return (schedule.dayOfMonth != null ? Number(schedule.dayOfMonth) : 1) === nowInZone.dayOfMonth;
      return true;
    }

    var now = { hour: 8, minute: 0, dayOfWeek: 3, dayOfMonth: 10, month: 3, dateStr: '2026-03-10' };
    var schedArray = { pattern: 'weekly', time: '08:00', dayOfWeek: [1, 3, 5] };
    assertTrue(shouldRunRecurring(schedArray, now), 'should run on Wed when [Mon,Wed,Fri]');

    var schedArrayNo = { pattern: 'weekly', time: '08:00', dayOfWeek: [1, 5] };
    assertFalse(shouldRunRecurring(schedArrayNo, now), 'should NOT run on Wed when [Mon,Fri]');

    var schedSingle = { pattern: 'weekly', time: '08:00', dayOfWeek: 3 };
    assertTrue(shouldRunRecurring(schedSingle, now), 'should run on Wed when dayOfWeek=3');

    var schedSingleNo = { pattern: 'weekly', time: '08:00', dayOfWeek: 0 };
    assertFalse(shouldRunRecurring(schedSingleNo, now), 'should NOT run on Wed when dayOfWeek=0');
  }

  /** shouldRunRecurring: already ran today */
  function testShouldRunRecurringAlreadyRan() {
    function shouldRunRecurring(schedule, nowInZone) {
      var time = (schedule.time || '00:00').trim();
      var parts = time.split(':');
      if (nowInZone.hour !== (parseInt(parts[0], 10) || 0) || nowInZone.minute !== (parseInt(parts[1], 10) || 0)) return false;
      var lastRun = schedule.lastRunAt || '';
      if (lastRun === nowInZone.dateStr) return false;
      return true;
    }
    var now = { hour: 9, minute: 0, dateStr: '2026-03-10' };
    var schedAlreadyRan = { time: '09:00', lastRunAt: '2026-03-10' };
    assertFalse(shouldRunRecurring(schedAlreadyRan, now), 'should NOT run if already ran today');
  }

  /** shouldRunRecurring: unknown pattern must not run (not treated as daily) */
  function testShouldRunRecurringUnknownPattern() {
    function shouldRunRecurring(schedule, nowInZone) {
      var time = (schedule.time || '00:00').trim();
      var schedHour = parseInt(time.split(':')[0], 10) || 0;
      var schedMin = parseInt(time.split(':')[1], 10) || 0;
      if (nowInZone.hour !== schedHour || nowInZone.minute !== schedMin) return false;
      var pattern = (schedule.pattern || 'daily').toLowerCase();
      var lastRun = schedule.lastRunAt || '';
      if (lastRun === nowInZone.dateStr) return false;
      if (pattern === 'daily') return true;
      if (pattern === 'weekly') {
        var days = schedule.dayOfWeek;
        if (!Array.isArray(days) && days != null) return Number(days) === nowInZone.dayOfWeek;
        return Array.isArray(days) && days.some(function (d) { return Number(d) === nowInZone.dayOfWeek; });
      }
      if (pattern === 'monthly') return (schedule.dayOfMonth != null ? Number(schedule.dayOfMonth) : 1) === nowInZone.dayOfMonth;
      if (pattern === 'yearly') {
        var monthDay = schedule.monthDay;
        if (monthDay) {
          var md = String(monthDay).split('/');
          var m = parseInt(md[0], 10);
          var d = parseInt(md[1], 10);
          return m === nowInZone.month && d === nowInZone.dayOfMonth;
        }
        return (schedule.month != null ? Number(schedule.month) : 1) === nowInZone.month &&
          (schedule.dayOfMonth != null ? Number(schedule.dayOfMonth) : 1) === nowInZone.dayOfMonth;
      }
      return false;
    }
    var now = { hour: 9, minute: 0, dateStr: '2026-03-10', dayOfWeek: 2, dayOfMonth: 10, month: 3 };
    assertFalse(shouldRunRecurring({ pattern: 'dailly', time: '09:00' }, now), 'typo pattern should not run');
    assertFalse(shouldRunRecurring({ pattern: 'unknown', time: '09:00' }, now), 'unknown pattern should not run');
  }

  /** resolveNestedWorkflowsInBackground */
  function testResolveNestedWorkflows() {
    function resolveNestedWorkflowsInBackground(workflow, allWorkflows, seen) {
      if (!seen) seen = new Set();
      if (!workflow || !workflow.actions || !workflow.actions.length) return workflow;
      var resolved = JSON.parse(JSON.stringify(workflow));
      for (var i = 0; i < resolved.actions.length; i++) {
        var a = resolved.actions[i];
        if (a.type === 'runWorkflow' && a.workflowId) {
          var nested = allWorkflows[a.workflowId] && allWorkflows[a.workflowId].analyzed;
          if (!nested || !nested.actions || !nested.actions.length) return null;
          if (seen.has(a.workflowId)) return null;
          seen.add(a.workflowId);
          a.nestedWorkflow = resolveNestedWorkflowsInBackground(nested, allWorkflows, seen);
          seen.delete(a.workflowId);
          if (!a.nestedWorkflow) return null;
        }
      }
      return resolved;
    }

    var allWf = {
      child: { analyzed: { actions: [{ type: 'click' }] } },
    };
    var parent = { actions: [{ type: 'runWorkflow', workflowId: 'child' }] };
    var result = resolveNestedWorkflowsInBackground(parent, allWf);
    assertTrue(result !== null, 'resolved non-null');
    assertTrue(result.actions[0].nestedWorkflow !== undefined, 'nestedWorkflow attached');
    assertEqual(result.actions[0].nestedWorkflow.actions[0].type, 'click');

    var missing = { actions: [{ type: 'runWorkflow', workflowId: 'nonexistent' }] };
    assertEqual(resolveNestedWorkflowsInBackground(missing, allWf), null, 'missing workflow returns null');

    var circular = {
      a: { analyzed: { actions: [{ type: 'runWorkflow', workflowId: 'b' }] } },
      b: { analyzed: { actions: [{ type: 'runWorkflow', workflowId: 'a' }] } },
    };
    var circResult = resolveNestedWorkflowsInBackground(circular.a.analyzed, circular);
    assertEqual(circResult, null, 'circular reference returns null');

    var empty = { actions: [] };
    var emptyResult = resolveNestedWorkflowsInBackground(empty, allWf);
    assertDeepEqual(emptyResult, { actions: [] }, 'empty actions returns as-is');
  }

  /** normalizeProjectStepHandlers */
  function testNormalizeProjectStepHandlers() {
    function normalize(data) {
      return {
        stepIds: Array.isArray(data && data.stepIds) ? data.stepIds : [],
        codeById: data && data.codeById && typeof data.codeById === 'object' && !Array.isArray(data.codeById) ? data.codeById : {},
      };
    }

    var r1 = normalize({ stepIds: ['a', 'b'], codeById: { a: 'code' } });
    assertDeepEqual(r1.stepIds, ['a', 'b']);
    assertEqual(r1.codeById.a, 'code');

    var r2 = normalize(null);
    assertDeepEqual(r2.stepIds, []);
    assertDeepEqual(r2.codeById, {});

    var r3 = normalize({});
    assertDeepEqual(r3.stepIds, []);
    assertDeepEqual(r3.codeById, {});

    var r4 = normalize({ stepIds: 'not-array', codeById: [1, 2] });
    assertDeepEqual(r4.stepIds, []);
    assertDeepEqual(r4.codeById, {});
  }

  /** mkHistoryEntry */
  function testMkHistoryEntry() {
    function mkHistoryEntry(entry, status, error, startedAt) {
      var endedAt = Date.now();
      var r = {
        workflowId: entry.workflowId,
        workflowName: entry.workflowName || entry.workflowId,
        startedAt: startedAt != null ? startedAt : endedAt,
        endedAt: endedAt,
        status: status,
        type: 'row',
      };
      if (error) r.error = error;
      return r;
    }

    var ok = mkHistoryEntry({ workflowId: 'wf1', workflowName: 'Workflow 1' }, 'success');
    assertEqual(ok.workflowId, 'wf1');
    assertEqual(ok.workflowName, 'Workflow 1');
    assertEqual(ok.status, 'success');
    assertEqual(ok.type, 'row');
    assertTrue(ok.startedAt > 0);
    assertTrue(ok.endedAt >= ok.startedAt);
    assertEqual(ok.error, undefined);

    var fail = mkHistoryEntry({ workflowId: 'wf2' }, 'failed', 'timeout');
    assertEqual(fail.workflowName, 'wf2');
    assertEqual(fail.status, 'failed');
    assertEqual(fail.error, 'timeout');

    var withStart = mkHistoryEntry({ workflowId: 'wf3' }, 'success', undefined, 100);
    assertEqual(withStart.startedAt, 100);
    assertTrue(withStart.endedAt >= withStart.startedAt);
  }

  /** validateMessagePayload */
  function testValidateMessagePayload() {
    function validateMessagePayload(type, msg) {
      switch (type) {
        case 'INJECT_STEP_HANDLERS':
          if (msg.files != null && !Array.isArray(msg.files)) return { valid: false, error: 'files must be array' };
          if (msg.files && msg.files.some(function(f) { return typeof f !== 'string'; })) return { valid: false, error: 'files must be strings' };
          break;
        case 'SET_PROJECT_STEP_HANDLERS':
          if (msg.stepIds != null && !Array.isArray(msg.stepIds)) return { valid: false, error: 'stepIds must be array' };
          if (msg.codeById != null && (typeof msg.codeById !== 'object' || Array.isArray(msg.codeById))) return { valid: false, error: 'codeById must be object' };
          break;
        case 'DOWNLOAD_FILE':
        case 'FETCH_FILE':
          if (!msg.url || typeof msg.url !== 'string') return { valid: false, error: 'url required' };
          break;
        case 'SEND_TO_ENDPOINT':
          if (!msg.url || typeof msg.url !== 'string') return { valid: false, error: 'url required' };
          break;
        case 'APIFY_TEST_TOKEN': {
          var apifyTestTokMax = 2048;
          if (msg.token != null && String(msg.token).trim().length > apifyTestTokMax) {
            return { valid: false, error: 'token exceeds ' + apifyTestTokMax + ' characters' };
          }
          break;
        }
        case 'APIFY_RUN_CANCEL':
          if (msg.tabId != null && msg.tabId !== '') {
            var tabIdNum = Number(msg.tabId);
            if (!isFinite(tabIdNum) || tabIdNum !== Math.floor(tabIdNum) || tabIdNum < 0) {
              return { valid: false, error: 'tabId must be a non-negative integer when provided' };
            }
          }
          break;
        case 'APIFY_RUN': {
          var apifyFieldMax = 2048;
          var apifyBuildMax = 256;
          var apifyInputMaxBytes = 2 * 1024 * 1024;
          var apifyOutKeyMax = 256;
          var apifyResourceIdMax = 512;
          var apifyTokenMax = 2048;
          if (msg.targetType !== 'actor' && msg.targetType !== 'task') {
            return { valid: false, error: 'targetType must be actor or task' };
          }
          if (!msg.resourceId || typeof msg.resourceId !== 'string' || !String(msg.resourceId).trim()) {
            return { valid: false, error: 'resourceId required' };
          }
          if (String(msg.resourceId).trim().length > apifyResourceIdMax) {
            return { valid: false, error: 'resourceId exceeds ' + apifyResourceIdMax + ' characters' };
          }
          if (msg.token != null && String(msg.token).trim().length > apifyTokenMax) {
            return { valid: false, error: 'token exceeds ' + apifyTokenMax + ' characters' };
          }
          if (msg.mode !== 'syncDataset' && msg.mode !== 'syncOutput' && msg.mode !== 'asyncPoll') {
            return { valid: false, error: 'mode must be syncDataset, syncOutput, or asyncPoll' };
          }
          if (msg.asyncResultType != null && String(msg.asyncResultType) !== ''
            && msg.asyncResultType !== 'dataset' && msg.asyncResultType !== 'output') {
            return { valid: false, error: 'asyncResultType must be dataset or output' };
          }
          if (msg.apifySyncDatasetFields != null && String(msg.apifySyncDatasetFields).length > apifyFieldMax) {
            return { valid: false, error: 'apifySyncDatasetFields exceeds ' + apifyFieldMax + ' characters' };
          }
          if (msg.apifySyncDatasetOmit != null && String(msg.apifySyncDatasetOmit).length > apifyFieldMax) {
            return { valid: false, error: 'apifySyncDatasetOmit exceeds ' + apifyFieldMax + ' characters' };
          }
          if (msg.input != null) {
            if (typeof msg.input !== 'object' || Array.isArray(msg.input)) {
              return { valid: false, error: 'input must be a plain object when provided' };
            }
            var inputStr;
            try {
              inputStr = JSON.stringify(msg.input);
            } catch (e) {
              return { valid: false, error: 'input must be JSON-serializable' };
            }
            var inputBytes = new TextEncoder().encode(inputStr).length;
            if (inputBytes > apifyInputMaxBytes) {
              return { valid: false, error: 'Apify input JSON exceeds ' + apifyInputMaxBytes + ' bytes (UTF-8)' };
            }
          }
          if (msg.outputRecordKey != null && String(msg.outputRecordKey).length > apifyOutKeyMax) {
            return { valid: false, error: 'outputRecordKey exceeds ' + apifyOutKeyMax + ' characters' };
          }
          if (msg.apifyBuild != null && String(msg.apifyBuild).trim().length > apifyBuildMax) {
            return { valid: false, error: 'apifyBuild exceeds ' + apifyBuildMax + ' characters (after trim)' };
          }
          var apifySyncTimeoutMax = 600000;
          var apifyAsyncMaxWaitMax = 2 * 3600 * 1000;
          var apifyPollMax = 300000;
          var apifyDatasetItemsMax = 50000000;
          if (msg.syncTimeoutMs != null && msg.syncTimeoutMs !== '') {
            var st = Number(msg.syncTimeoutMs);
            if (isFinite(st) && st < 1000) {
              return { valid: false, error: 'syncTimeoutMs must be at least 1000 ms when set' };
            }
            if (isFinite(st) && st > apifySyncTimeoutMax) {
              return { valid: false, error: 'syncTimeoutMs exceeds ' + apifySyncTimeoutMax + ' ms' };
            }
          }
          if (msg.asyncMaxWaitMs != null && msg.asyncMaxWaitMs !== '') {
            var am = Number(msg.asyncMaxWaitMs);
            if (isFinite(am) && am < 1000) {
              return { valid: false, error: 'asyncMaxWaitMs must be at least 1000 ms when set' };
            }
            if (isFinite(am) && am > apifyAsyncMaxWaitMax) {
              return { valid: false, error: 'asyncMaxWaitMs exceeds ' + apifyAsyncMaxWaitMax + ' ms' };
            }
          }
          if (msg.pollIntervalMs != null && msg.pollIntervalMs !== '') {
            var pi = Number(msg.pollIntervalMs);
            if (isFinite(pi) && pi < 0) {
              return { valid: false, error: 'pollIntervalMs must be non-negative' };
            }
            if (isFinite(pi) && pi > apifyPollMax) {
              return { valid: false, error: 'pollIntervalMs exceeds ' + apifyPollMax + ' ms' };
            }
          }
          if (msg.datasetMaxItems != null && msg.datasetMaxItems !== '') {
            var dm = Number(msg.datasetMaxItems);
            if (isFinite(dm) && dm < 0) {
              return { valid: false, error: 'datasetMaxItems must be non-negative' };
            }
            if (isFinite(dm) && dm > apifyDatasetItemsMax) {
              return { valid: false, error: 'datasetMaxItems exceeds ' + apifyDatasetItemsMax };
            }
          }
          if (typeof CFS_apifyRunQueryParamsValidationError === 'function') {
            var apifyQe = CFS_apifyRunQueryParamsValidationError(msg);
            if (apifyQe) return { valid: false, error: apifyQe };
          }
          break;
        }
        case 'APIFY_RUN_START': {
          var apifyBuildMaxS = 256;
          var apifyInputMaxBytesS = 2 * 1024 * 1024;
          var apifyResourceIdMaxS = 512;
          var apifyTokenMaxS = 2048;
          if (msg.targetType !== 'actor' && msg.targetType !== 'task') {
            return { valid: false, error: 'targetType must be actor or task' };
          }
          if (!msg.resourceId || typeof msg.resourceId !== 'string' || !String(msg.resourceId).trim()) {
            return { valid: false, error: 'resourceId required' };
          }
          if (String(msg.resourceId).trim().length > apifyResourceIdMaxS) {
            return { valid: false, error: 'resourceId exceeds ' + apifyResourceIdMaxS + ' characters' };
          }
          if (msg.token != null && String(msg.token).trim().length > apifyTokenMaxS) {
            return { valid: false, error: 'token exceeds ' + apifyTokenMaxS + ' characters' };
          }
          if (msg.input != null) {
            if (typeof msg.input !== 'object' || Array.isArray(msg.input)) {
              return { valid: false, error: 'input must be a plain object when provided' };
            }
            var inputStrS;
            try {
              inputStrS = JSON.stringify(msg.input);
            } catch (e) {
              return { valid: false, error: 'input must be JSON-serializable' };
            }
            var inputBytesS = new TextEncoder().encode(inputStrS).length;
            if (inputBytesS > apifyInputMaxBytesS) {
              return { valid: false, error: 'Apify input JSON exceeds ' + apifyInputMaxBytesS + ' bytes (UTF-8)' };
            }
          }
          if (msg.apifyBuild != null && String(msg.apifyBuild).trim().length > apifyBuildMaxS) {
            return { valid: false, error: 'apifyBuild exceeds ' + apifyBuildMaxS + ' characters (after trim)' };
          }
          if (typeof CFS_apifyRunQueryParamsValidationError === 'function') {
            var apifyQeS = CFS_apifyRunQueryParamsValidationError(msg);
            if (apifyQeS) return { valid: false, error: apifyQeS };
          }
          break;
        }
        case 'APIFY_RUN_WAIT': {
          var apifyFieldMaxW = 2048;
          var apifyOutKeyMaxW = 256;
          var apifyRunIdMaxW = 512;
          var apifyTokenMaxW = 2048;
          var apifyAsyncMaxWaitMaxW = 2 * 3600 * 1000;
          var apifyPollMaxW = 300000;
          var apifyDatasetItemsMaxW = 50000000;
          if (!msg.runId || typeof msg.runId !== 'string' || !String(msg.runId).trim()) {
            return { valid: false, error: 'runId required' };
          }
          if (String(msg.runId).trim().length > apifyRunIdMaxW) {
            return { valid: false, error: 'runId exceeds ' + apifyRunIdMaxW + ' characters' };
          }
          if (msg.token != null && String(msg.token).trim().length > apifyTokenMaxW) {
            return { valid: false, error: 'token exceeds ' + apifyTokenMaxW + ' characters' };
          }
          if (msg.fetchAfter != null && String(msg.fetchAfter) !== ''
            && msg.fetchAfter !== 'none' && msg.fetchAfter !== 'dataset' && msg.fetchAfter !== 'output') {
            return { valid: false, error: 'fetchAfter must be none, dataset, or output' };
          }
          if (msg.apifySyncDatasetFields != null && String(msg.apifySyncDatasetFields).length > apifyFieldMaxW) {
            return { valid: false, error: 'apifySyncDatasetFields exceeds ' + apifyFieldMaxW + ' characters' };
          }
          if (msg.apifySyncDatasetOmit != null && String(msg.apifySyncDatasetOmit).length > apifyFieldMaxW) {
            return { valid: false, error: 'apifySyncDatasetOmit exceeds ' + apifyFieldMaxW + ' characters' };
          }
          if (msg.outputRecordKey != null && String(msg.outputRecordKey).length > apifyOutKeyMaxW) {
            return { valid: false, error: 'outputRecordKey exceeds ' + apifyOutKeyMaxW + ' characters' };
          }
          if (msg.asyncMaxWaitMs != null && msg.asyncMaxWaitMs !== '') {
            var amw = Number(msg.asyncMaxWaitMs);
            if (isFinite(amw) && amw < 1000) {
              return { valid: false, error: 'asyncMaxWaitMs must be at least 1000 ms when set' };
            }
            if (isFinite(amw) && amw > apifyAsyncMaxWaitMaxW) {
              return { valid: false, error: 'asyncMaxWaitMs exceeds ' + apifyAsyncMaxWaitMaxW + ' ms' };
            }
          }
          if (msg.pollIntervalMs != null && msg.pollIntervalMs !== '') {
            var piw = Number(msg.pollIntervalMs);
            if (isFinite(piw) && piw < 0) {
              return { valid: false, error: 'pollIntervalMs must be non-negative' };
            }
            if (isFinite(piw) && piw > apifyPollMaxW) {
              return { valid: false, error: 'pollIntervalMs exceeds ' + apifyPollMaxW + ' ms' };
            }
          }
          if (msg.datasetMaxItems != null && msg.datasetMaxItems !== '') {
            var dmw = Number(msg.datasetMaxItems);
            if (isFinite(dmw) && dmw < 0) {
              return { valid: false, error: 'datasetMaxItems must be non-negative' };
            }
            if (isFinite(dmw) && dmw > apifyDatasetItemsMaxW) {
              return { valid: false, error: 'datasetMaxItems exceeds ' + apifyDatasetItemsMaxW };
            }
          }
          if (typeof CFS_apifyRunQueryParamsValidationError === 'function') {
            var apifyQeW = CFS_apifyRunQueryParamsValidationError(msg);
            if (apifyQeW) return { valid: false, error: apifyQeW };
          }
          break;
        }
        case 'APIFY_DATASET_ITEMS': {
          var apifyFieldMaxD = 2048;
          var apifyDatasetIdMaxD = 512;
          var apifyTokenMaxD = 2048;
          var apifyDatasetItemsMaxD = 50000000;
          if (!msg.datasetId || typeof msg.datasetId !== 'string' || !String(msg.datasetId).trim()) {
            return { valid: false, error: 'datasetId required' };
          }
          if (String(msg.datasetId).trim().length > apifyDatasetIdMaxD) {
            return { valid: false, error: 'datasetId exceeds ' + apifyDatasetIdMaxD + ' characters' };
          }
          if (msg.token != null && String(msg.token).trim().length > apifyTokenMaxD) {
            return { valid: false, error: 'token exceeds ' + apifyTokenMaxD + ' characters' };
          }
          if (msg.apifySyncDatasetFields != null && String(msg.apifySyncDatasetFields).length > apifyFieldMaxD) {
            return { valid: false, error: 'apifySyncDatasetFields exceeds ' + apifyFieldMaxD + ' characters' };
          }
          if (msg.apifySyncDatasetOmit != null && String(msg.apifySyncDatasetOmit).length > apifyFieldMaxD) {
            return { valid: false, error: 'apifySyncDatasetOmit exceeds ' + apifyFieldMaxD + ' characters' };
          }
          if (msg.datasetMaxItems != null && msg.datasetMaxItems !== '') {
            var dmd = Number(msg.datasetMaxItems);
            if (isFinite(dmd) && dmd < 0) {
              return { valid: false, error: 'datasetMaxItems must be non-negative' };
            }
            if (isFinite(dmd) && dmd > apifyDatasetItemsMaxD) {
              return { valid: false, error: 'datasetMaxItems exceeds ' + apifyDatasetItemsMaxD };
            }
          }
          break;
        }
        case 'UPLOAD_POST':
          if (!msg.apiKey || typeof msg.apiKey !== 'string') return { valid: false, error: 'apiKey required' };
          if (!msg.formFields || typeof msg.formFields !== 'object') return { valid: false, error: 'formFields required' };
          if (!msg.formFields.user || typeof msg.formFields.user !== 'string') return { valid: false, error: 'formFields.user required' };
          if (!Array.isArray(msg.formFields.platform) || msg.formFields.platform.length === 0) return { valid: false, error: 'formFields.platform array required' };
          var pt = msg.formFields.postType || 'video';
          if (pt === 'video' && (!msg.formFields.video || typeof msg.formFields.video !== 'string')) return { valid: false, error: 'formFields.video required for video' };
          if (pt === 'photo' && !msg.formFields.photos) return { valid: false, error: 'formFields.photos required for photo' };
          if (pt === 'text' && (!msg.formFields.title || typeof msg.formFields.title !== 'string')) return { valid: false, error: 'formFields.title required for text' };
          break;
        case 'RUN_WORKFLOW':
          if (!msg.workflowId || typeof msg.workflowId !== 'string') return { valid: false, error: 'workflowId required' };
          break;
        case 'SET_PENDING_GENERATIONS':
          if (!Array.isArray(msg.list)) return { valid: false, error: 'list must be an array' };
          if (msg.list.length > 500) return { valid: false, error: 'list length must be at most 500' };
          break;
        case 'CFS_CRYPTO_TEST_ENSURE_WALLETS':
          if (msg.fundOnly === true && msg.replaceExisting === true) {
            return {
              valid: false,
              error: 'fundOnly and replaceExisting cannot be used together (replace removes wallets; run full ensure without fundOnly, then fundOnly if needed)',
            };
          }
          break;
        default:
          break;
      }
      return { valid: true };
    }

    assertTrue(validateMessagePayload('INJECT_STEP_HANDLERS', { files: ['a.js'] }).valid);
    assertFalse(validateMessagePayload('INJECT_STEP_HANDLERS', { files: 'bad' }).valid);
    assertFalse(validateMessagePayload('INJECT_STEP_HANDLERS', { files: [123] }).valid);
    assertTrue(validateMessagePayload('INJECT_STEP_HANDLERS', {}).valid);

    assertTrue(validateMessagePayload('SET_PROJECT_STEP_HANDLERS', { stepIds: [], codeById: {} }).valid);
    assertFalse(validateMessagePayload('SET_PROJECT_STEP_HANDLERS', { stepIds: 'bad' }).valid);
    assertFalse(validateMessagePayload('SET_PROJECT_STEP_HANDLERS', { codeById: [1] }).valid);

    assertFalse(validateMessagePayload('DOWNLOAD_FILE', {}).valid);
    assertFalse(validateMessagePayload('DOWNLOAD_FILE', { url: 123 }).valid);
    assertTrue(validateMessagePayload('DOWNLOAD_FILE', { url: 'http://x' }).valid);

    assertFalse(validateMessagePayload('FETCH_FILE', {}).valid);
    assertTrue(validateMessagePayload('FETCH_FILE', { url: 'http://x' }).valid);

    assertFalse(validateMessagePayload('SET_PENDING_GENERATIONS', {}).valid);
    assertFalse(validateMessagePayload('SET_PENDING_GENERATIONS', { list: 'bad' }).valid);
    assertTrue(validateMessagePayload('SET_PENDING_GENERATIONS', { list: [] }).valid);
    assertTrue(validateMessagePayload('SET_PENDING_GENERATIONS', { list: [{ data: 'x' }] }).valid);

    assertTrue(validateMessagePayload('CFS_CRYPTO_TEST_ENSURE_WALLETS', {}).valid);
    assertTrue(validateMessagePayload('CFS_CRYPTO_TEST_ENSURE_WALLETS', { fundOnly: true }).valid);
    assertTrue(validateMessagePayload('CFS_CRYPTO_TEST_ENSURE_WALLETS', { replaceExisting: true }).valid);
    assertFalse(validateMessagePayload('CFS_CRYPTO_TEST_ENSURE_WALLETS', { fundOnly: true, replaceExisting: true }).valid);

    assertFalse(validateMessagePayload('SEND_TO_ENDPOINT', {}).valid);
    assertTrue(validateMessagePayload('SEND_TO_ENDPOINT', { url: 'http://x' }).valid);

    assertTrue(validateMessagePayload('APIFY_TEST_TOKEN', {}).valid);
    assertTrue(validateMessagePayload('APIFY_TEST_TOKEN', { token: 'x' }).valid);
    assertFalse(validateMessagePayload('APIFY_TEST_TOKEN', { token: new Array(2050).join('t') }).valid);

    assertFalse(validateMessagePayload('APIFY_RUN', {}).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', { targetType: 'actor' }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', { targetType: 'bad', resourceId: 'x', mode: 'syncDataset' }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', { targetType: 'actor', resourceId: '  ', mode: 'syncDataset' }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', { targetType: 'actor', resourceId: 'id', mode: 'bad' }).valid);
    assertTrue(validateMessagePayload('APIFY_RUN_CANCEL', {}).valid);
    assertTrue(validateMessagePayload('APIFY_RUN_CANCEL', { tabId: 0 }).valid);
    assertTrue(validateMessagePayload('APIFY_RUN_CANCEL', { tabId: '42' }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN_CANCEL', { tabId: -1 }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN_CANCEL', { tabId: 1.5 }).valid);
    assertTrue(validateMessagePayload('APIFY_RUN', { targetType: 'actor', resourceId: 'apify~x', mode: 'syncDataset' }).valid);
    assertTrue(validateMessagePayload('APIFY_RUN', { targetType: 'task', resourceId: 'task1', mode: 'asyncPoll' }).valid);
    assertTrue(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncDataset',
      apifySyncDatasetFields: 'url,title',
      apifySyncDatasetOmit: 'html',
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', { targetType: 'actor', resourceId: 'x', mode: 'syncDataset', asyncResultType: 'nope' }).valid);
    var longApifyStr = new Array(2050).join('x');
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncDataset',
      apifySyncDatasetFields: longApifyStr,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncDataset',
      apifySyncDatasetOmit: longApifyStr,
    }).valid);

    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncDataset',
      input: [1, 2],
    }).valid);
    (function() {
      var circular = {};
      circular.self = circular;
      assertFalse(validateMessagePayload('APIFY_RUN', {
        targetType: 'actor',
        resourceId: 'x',
        mode: 'syncDataset',
        input: circular,
      }).valid);
    }());
    var hugeInput = { blob: new Array(2 * 1024 * 1024 + 2).join('y') };
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncDataset',
      input: hugeInput,
    }).valid);

    var longOutKey = new Array(258).join('z');
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncOutput',
      outputRecordKey: longOutKey,
    }).valid);

    var longResourceId = new Array(514).join('r');
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: longResourceId,
      mode: 'syncDataset',
    }).valid);

    var longToken = new Array(2050).join('t');
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncDataset',
      token: longToken,
    }).valid);

    var longBuild = new Array(258).join('b');
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor',
      resourceId: 'x',
      mode: 'syncDataset',
      apifyBuild: longBuild,
    }).valid);

    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'syncDataset', syncTimeoutMs: 500,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'syncDataset', syncTimeoutMs: 600001,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', asyncMaxWaitMs: 500,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', asyncMaxWaitMs: 2 * 3600 * 1000 + 1,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', pollIntervalMs: -1,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', pollIntervalMs: 300001,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', datasetMaxItems: -1,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', datasetMaxItems: 50000001,
    }).valid);
    assertTrue(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', pollIntervalMs: 0,
    }).valid);

    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'syncDataset', apifyRunTimeoutSecs: 700000,
    }).valid);
    assertTrue(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'syncDataset', apifyRunTimeoutSecs: 604800,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', apifyStartWaitForFinishSecs: 0,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'asyncPoll', apifyStartWaitForFinishSecs: 61,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'syncDataset', apifySyncDatasetLimit: 2000000,
    }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN', {
      targetType: 'actor', resourceId: 'x', mode: 'syncDataset', apifyMaxTotalChargeUsd: 2000000,
    }).valid);

    assertFalse(validateMessagePayload('APIFY_RUN_START', {}).valid);
    assertTrue(validateMessagePayload('APIFY_RUN_START', { targetType: 'actor', resourceId: 'a~b', input: {} }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN_WAIT', {}).valid);
    assertTrue(validateMessagePayload('APIFY_RUN_WAIT', { runId: 'run1', fetchAfter: 'none' }).valid);
    assertFalse(validateMessagePayload('APIFY_RUN_WAIT', { runId: 'x', fetchAfter: 'bogus' }).valid);
    assertFalse(validateMessagePayload('APIFY_DATASET_ITEMS', {}).valid);
    assertTrue(validateMessagePayload('APIFY_DATASET_ITEMS', { datasetId: 'ds123' }).valid);

    assertFalse(validateMessagePayload('UPLOAD_POST', {}).valid);
    assertFalse(validateMessagePayload('UPLOAD_POST', { apiKey: 'key' }).valid);
    assertFalse(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: {} }).valid);
    assertFalse(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: { user: 'u', platform: [], video: 'url' } }).valid);
    assertTrue(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: { user: 'u', platform: ['tiktok'], video: 'https://v.com/a.mp4' } }).valid);
    assertTrue(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: { user: 'u', platform: ['facebook'], postType: 'text', title: 'Hello' } }).valid);
    assertFalse(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: { user: 'u', platform: ['facebook'], postType: 'text' } }).valid);
    assertTrue(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: { user: 'u', platform: ['instagram'], postType: 'photo', photos: ['https://img.com/a.jpg'] } }).valid);
    assertFalse(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: { user: 'u', platform: ['instagram'], postType: 'photo' } }).valid);
    assertFalse(validateMessagePayload('UPLOAD_POST', { apiKey: 'key', formFields: { user: 'u', platform: ['tiktok'], postType: 'video' } }).valid);

    assertFalse(validateMessagePayload('RUN_WORKFLOW', {}).valid);
    assertFalse(validateMessagePayload('RUN_WORKFLOW', { workflowId: '' }).valid);
    assertTrue(validateMessagePayload('RUN_WORKFLOW', { workflowId: 'test' }).valid);

    assertTrue(validateMessagePayload('UNKNOWN_TYPE', {}).valid, 'unknown type passes validation');
  }

  /** Offscreen mutex pattern: promise-chain serialization */
  function testOffscreenMutexFIFOOrder() {
    var order = [];
    var mutex = Promise.resolve();

    function acquire(label) {
      var release;
      var prev = mutex;
      mutex = new Promise(function (r) { release = r; });
      return prev.then(function () {
        order.push(label + ':start');
        return release;
      });
    }

    var done = Promise.all([
      acquire('A').then(function (rel) {
        return new Promise(function (r) {
          setTimeout(function () { order.push('A:end'); rel(); r(); }, 20);
        });
      }),
      acquire('B').then(function (rel) {
        return new Promise(function (r) {
          setTimeout(function () { order.push('B:end'); rel(); r(); }, 10);
        });
      }),
      acquire('C').then(function (rel) {
        order.push('C:end'); rel();
        return Promise.resolve();
      }),
    ]);

    return done.then(function () {
      assertDeepEqual(order, ['A:start', 'A:end', 'B:start', 'B:end', 'C:start', 'C:end'],
        'mutex should enforce FIFO order');
    });
  }

  function testOffscreenMutexErrorRelease() {
    var order = [];
    var mutex = Promise.resolve();

    function acquire(label) {
      var release;
      var prev = mutex;
      mutex = new Promise(function (r) { release = r; });
      return prev.then(function () {
        order.push(label + ':acquired');
        return release;
      });
    }

    var done = Promise.all([
      acquire('A').then(function (rel) {
        order.push('A:error');
        rel();
      }),
      acquire('B').then(function (rel) {
        order.push('B:ok');
        rel();
      }),
    ]);

    return done.then(function () {
      assertDeepEqual(order, ['A:acquired', 'A:error', 'B:acquired', 'B:ok'],
        'error in first holder should release mutex for second');
    });
  }

  function testOffscreenMutexSingleConcurrent() {
    var concurrent = 0;
    var maxConcurrent = 0;
    var mutex = Promise.resolve();

    function acquire() {
      var release;
      var prev = mutex;
      mutex = new Promise(function (r) { release = r; });
      return prev.then(function () {
        concurrent++;
        if (concurrent > maxConcurrent) maxConcurrent = concurrent;
        return release;
      });
    }

    function doWork(rel) {
      return new Promise(function (r) {
        setTimeout(function () {
          concurrent--;
          rel();
          r();
        }, 5);
      });
    }

    var done = Promise.all([
      acquire().then(doWork),
      acquire().then(doWork),
      acquire().then(doWork),
      acquire().then(doWork),
    ]);

    return done.then(function () {
      assertEqual(maxConcurrent, 1, 'at most 1 concurrent holder');
      assertEqual(concurrent, 0, 'all released');
    });
  }

  /* =========================================================================
   * selectors.js — additional coverage
   * ========================================================================= */

  function testSelectorEntryKey() {
    var k = global.selectorEntryKey;
    if (!k) throw new Error('selectorEntryKey not loaded');
    assertEqual(k(null), '');
    assertEqual(k(undefined), '');
    assertEqual(k({ value: '#btn' }), '#btn');
    assertEqual(k({ value: { role: 'button', name: 'Save' } }), JSON.stringify({ role: 'button', name: 'Save' }));
    assertEqual(k({ value: 42 }), '42');
  }

  function testNormalizeSelectorEntry() {
    var n = global.normalizeSelectorEntry;
    if (!n) throw new Error('normalizeSelectorEntry not loaded');
    var obj = { type: 'id', value: '#x', score: 10 };
    assertEqual(n(obj), obj, 'object with type passed through');
    var str = n('#my-id');
    assertEqual(str.type, 'css');
    assertEqual(str.value, '#my-id');
    assertEqual(str.score, 0);
    assertEqual(n('  .cls  ').value, '.cls');
    assertEqual(n(null), null);
    assertEqual(n(''), null);
    assertEqual(n('   '), null);
    assertEqual(n(123), null);
  }

  function testActionSimilarityBasic() {
    var sim = global.actionSimilarity;
    if (!sim) throw new Error('actionSimilarity not loaded');
    assertEqual(sim({ type: 'click' }, { type: 'type' }), 0, 'different types = 0');
    assertTrue(sim({ type: 'click' }, { type: 'click' }) >= 0.5, 'same type >= 0.5');
  }

  function testActionSimilarityMatchingSelectors() {
    var sim = global.actionSimilarity;
    var a = { type: 'click', selectors: [{ type: 'id', value: '#btn' }], text: 'Save' };
    var b = { type: 'click', selectors: [{ type: 'id', value: '#btn' }], text: 'Save' };
    assertTrue(sim(a, b) > 0.8, 'matching id selectors + text should be high similarity');
  }

  function testActionSimilarityPartialSelectors() {
    var sim = global.actionSimilarity;
    var a = { type: 'click', selectors: [{ type: 'css', value: '.btn-primary' }], text: '' };
    var b = { type: 'click', selectors: [{ type: 'css', value: '.btn' }], text: '' };
    assertTrue(sim(a, b) > 0.5, 'partial selector overlap adds similarity');
  }

  function testActionSimilarityTypeInputs() {
    var sim = global.actionSimilarity;
    var a = { type: 'type', selectors: [], placeholder: 'Email', name: 'email', ariaLabel: 'Email address' };
    var b = { type: 'type', selectors: [], placeholder: 'Email', name: 'email', ariaLabel: 'Email address' };
    assertTrue(sim(a, b) >= 1.0, 'type inputs with same placeholder+name+ariaLabel should cap at 1.0');
  }

  function testActionSimilaritySelectInputs() {
    var sim = global.actionSimilarity;
    var a = { type: 'select', selectors: [], name: 'country' };
    var b = { type: 'select', selectors: [], name: 'country' };
    assertTrue(sim(a, b) >= 0.8, 'select with same name should score high');
    var c = { type: 'select', selectors: [], name: 'state' };
    assertTrue(sim(a, c) < sim(a, b), 'different name should score lower');
  }

  function testActionSimilarityClickText() {
    var sim = global.actionSimilarity;
    var a = { type: 'click', selectors: [], text: 'Submit Form' };
    var b = { type: 'click', selectors: [], text: 'Submit Form' };
    var c = { type: 'click', selectors: [], text: 'Cancel' };
    assertTrue(sim(a, b) > sim(a, c), 'same text should score higher than different text');
  }

  function testActionSelectorsToCssStringsExtended() {
    var fn = global.CFS_selectors && global.CFS_selectors.actionSelectorsToCssStrings;
    if (!fn) throw new Error('actionSelectorsToCssStrings not loaded');
    assertDeepEqual(fn({ selectors: ['#a'], fallbackSelectors: ['.b'] }), ['#a', '.b']);
    assertDeepEqual(fn({ selectors: [{ value: '#x' }, { selector: '.y' }] }), ['#x', '.y']);
    assertDeepEqual(fn({ selectors: [42, null, { noValue: true }] }), []);
    assertDeepEqual(fn({}), []);
    assertDeepEqual(fn(null), []);
  }

  function testScoreSelectorStringEdgeCases() {
    var s = global.CFS_selectors.scoreSelectorString;
    assertEqual(s(null).score, 0);
    assertEqual(s('').score, 0);
    assertEqual(s(123).score, 0);
    var nameResult = s('[name="email"]');
    assertTrue(nameResult.score >= 7, 'name attr should be >= 7');
    var placeholderResult = s('[placeholder="Enter email"]');
    assertTrue(placeholderResult.score >= 6, 'placeholder should be >= 6');
  }

  /* =========================================================================
   * selectors.js — generateSelectors coverage
   * ========================================================================= */

  function testGenerateSelectorsNull() {
    var gen = global.CFS_selectors.generateSelectors;
    if (!gen) throw new Error('generateSelectors not loaded');
    assertDeepEqual(gen(null), []);
    assertDeepEqual(gen(undefined), []);
    assertDeepEqual(gen({}), []);
    assertDeepEqual(gen({ noTagName: true }), []);
  }

  function testGenerateSelectorsWithId() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('button');
    el.id = 'cfs-test-stable-btn';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      assertTrue(sels.length > 0, 'should generate selectors');
      var idSel = sels.find(function(s) { return s.type === 'id'; });
      assertTrue(idSel !== undefined, 'should have id selector');
      assertEqual(idSel.score, 10);
      assertTrue(idSel.value.indexOf('cfs-test-stable-btn') >= 0);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsSkipsDynamicIds() {
    var gen = global.CFS_selectors.generateSelectors;
    var prefixes = ['ember123', 'react-root', 'vue-app', 'ng-ctrl', '__next-main', 'mui-45'];
    for (var i = 0; i < prefixes.length; i++) {
      var el = document.createElement('div');
      el.id = prefixes[i];
      document.body.appendChild(el);
      try {
        var sels = gen(el);
        var idSel = sels.find(function(s) { return s.type === 'id'; });
        assertEqual(idSel, undefined, 'should skip dynamic id: ' + prefixes[i]);
      } finally {
        document.body.removeChild(el);
      }
    }
  }

  function testGenerateSelectorsDataTestAttrs() {
    var gen = global.CFS_selectors.generateSelectors;
    var attrs = ['data-testid', 'data-cy', 'data-test', 'data-test-id'];
    for (var i = 0; i < attrs.length; i++) {
      var el = document.createElement('button');
      el.setAttribute(attrs[i], 'my-btn');
      document.body.appendChild(el);
      try {
        var sels = gen(el);
        var found = sels.find(function(s) { return s.type === 'attr' && s.attr === attrs[i]; });
        assertTrue(found !== undefined, 'should have selector for ' + attrs[i]);
        assertEqual(found.score, 9, attrs[i] + ' score should be 9');
        assertTrue(found.value.indexOf('my-btn') >= 0);
      } finally {
        document.body.removeChild(el);
      }
    }
  }

  function testGenerateSelectorsCustomDataAttrs() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('div');
    el.setAttribute('data-section', 'hero');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var found = sels.find(function(s) { return s.attr === 'data-section'; });
      assertTrue(found !== undefined, 'should capture custom data-* attr');
      assertEqual(found.score, 6);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsAriaLabel() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('button');
    el.setAttribute('aria-label', 'Close dialog');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var found = sels.find(function(s) { return s.attr === 'aria-label'; });
      assertTrue(found !== undefined, 'should have aria-label selector');
      assertEqual(found.score, 8);
      var partial = sels.find(function(s) { return s.type === 'attrContains' && s.attr === 'aria-label'; });
      assertTrue(partial !== undefined, 'should have attrContains for long aria-label');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testTryResolveAllWithSelectorAttrContainsAriaLabel() {
    var tryAll = global.CFS_selectors && global.CFS_selectors.tryResolveAllWithSelector;
    if (!tryAll) throw new Error('CFS_selectors.tryResolveAllWithSelector not loaded');
    var a = document.createElement('button');
    a.setAttribute('aria-label', 'User settings profile');
    var b = document.createElement('button');
    b.setAttribute('aria-label', 'Org settings profile');
    document.body.appendChild(a);
    document.body.appendChild(b);
    try {
      var sel = { type: 'attrContains', attr: 'aria-label', value: 'settings', score: 5 };
      var matches = tryAll(sel, document);
      assertEqual(matches.length, 2);
      assertTrue(matches.indexOf(a) >= 0);
      assertTrue(matches.indexOf(b) >= 0);
    } finally {
      document.body.removeChild(a);
      document.body.removeChild(b);
    }
  }

  function testGenerateSelectorsRole() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('div');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Submit');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var roleSel = sels.find(function(s) { return s.type === 'role'; });
      assertTrue(roleSel !== undefined, 'should have role selector');
      assertEqual(roleSel.score, 7);
      assertEqual(roleSel.value.role, 'button');
      assertEqual(roleSel.value.name, 'Submit');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsInputNameAndPlaceholder() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('input');
    el.setAttribute('name', 'email');
    el.setAttribute('placeholder', 'Enter your email');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var nameSel = sels.find(function(s) { return s.attr === 'name'; });
      assertTrue(nameSel !== undefined, 'should have name selector');
      assertEqual(nameSel.score, 8);
      assertTrue(nameSel.value.indexOf('email') >= 0);
      var phSel = sels.find(function(s) { return s.attr === 'placeholder'; });
      assertTrue(phSel !== undefined, 'should have placeholder selector');
      assertEqual(phSel.score, 6);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsInputType() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('input');
    el.setAttribute('type', 'checkbox');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var typeSel = sels.find(function(s) { return s.attr === 'type'; });
      assertTrue(typeSel !== undefined, 'should have type selector for input');
      assertEqual(typeSel.score, 5);
      assertTrue(typeSel.value.indexOf('checkbox') >= 0);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsStableClasses() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('div');
    el.className = 'main-container sidebar-panel';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var classSels = sels.filter(function(s) { return s.type === 'class'; });
      assertTrue(classSels.length >= 1, 'should have class selector');
      assertTrue(classSels[0].value.indexOf('main-container') >= 0);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsFiltersFrameworkClasses() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('div');
    el.className = 'ng-scope vue-component react-modal';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var classSel = sels.find(function(s) { return s.type === 'class'; });
      assertEqual(classSel, undefined, 'framework-prefixed classes should be filtered');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsButtonText() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('button');
    el.textContent = 'Save Changes';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var textSel = sels.find(function(s) { return s.type === 'text'; });
      assertTrue(textSel !== undefined, 'should have text selector for button');
      assertEqual(textSel.value, 'Save Changes');
      assertEqual(textSel.tag, 'button');
      assertEqual(textSel.score, 5);
      var containsSel = sels.find(function(s) { return s.type === 'textContains'; });
      assertTrue(containsSel !== undefined, 'should have textContains for long-enough text');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsXpathAndCssPath() {
    var gen = global.CFS_selectors.generateSelectors;
    var container = document.createElement('div');
    container.id = 'cfs-xpath-test-wrap';
    var child = document.createElement('span');
    container.appendChild(child);
    document.body.appendChild(container);
    try {
      var sels = gen(child);
      var xpathSel = sels.find(function(s) { return s.type === 'xpath'; });
      assertTrue(xpathSel !== undefined, 'should have xpath selector');
      assertEqual(xpathSel.score, 2);
      var cssSel = sels.find(function(s) { return s.type === 'cssPath'; });
      assertTrue(cssSel !== undefined, 'should have cssPath selector');
      assertEqual(cssSel.score, 3);
    } finally {
      document.body.removeChild(container);
    }
  }

  function testGenerateSelectorsAncestorDescendant() {
    var gen = global.CFS_selectors.generateSelectors;
    var parent = document.createElement('div');
    parent.setAttribute('data-testid', 'cfs-ancestor-panel');
    var child = document.createElement('span');
    child.textContent = 'inner content';
    parent.appendChild(child);
    document.body.appendChild(parent);
    try {
      var sels = gen(child);
      var ancSel = sels.find(function(s) { return s.type === 'ancestorDescendant'; });
      assertTrue(ancSel !== undefined, 'should have ancestorDescendant selector');
      assertTrue(ancSel.value.ancestor.indexOf('cfs-ancestor-panel') >= 0);
    } finally {
      document.body.removeChild(parent);
    }
  }

  function testGenerateSelectorsTitleAttr() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('button');
    el.setAttribute('title', 'Help information');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var titleSel = sels.find(function(s) { return s.attr === 'title'; });
      assertTrue(titleSel !== undefined, 'should have title selector');
      assertEqual(titleSel.score, 5);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsHref() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('a');
    el.setAttribute('href', 'https://example.com/about');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var hrefSel = sels.find(function(s) { return s.attr === 'href'; });
      assertTrue(hrefSel !== undefined, 'should have href selector');
      assertEqual(hrefSel.score, 5);
      assertTrue(hrefSel.value.indexOf('about') >= 0);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsXpathText() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('button');
    el.textContent = 'Continue to checkout';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var xtSel = sels.find(function(s) { return s.type === 'xpathText'; });
      assertTrue(xtSel !== undefined, 'should have xpathText selector');
      assertEqual(xtSel.score, 3);
      assertTrue(xtSel.value.indexOf('contains') >= 0);
      assertTrue(xtSel.value.indexOf('button') >= 0);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsComprehensiveElement() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('button');
    el.id = 'cfs-save-btn';
    el.setAttribute('data-testid', 'save');
    el.setAttribute('aria-label', 'Save document');
    el.className = 'btn-primary action-save';
    el.textContent = 'Save';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      assertTrue(sels.length >= 6, 'rich element should produce many selectors');
      var types = {};
      for (var i = 0; i < sels.length; i++) types[sels[i].type] = true;
      assertTrue(types.id, 'has id');
      assertTrue(types.attr, 'has attr');
      assertTrue(types.text, 'has text');
      assertTrue(types['class'], 'has class');
      var sorted = sels.slice().sort(function(a, b) { return b.score - a.score; });
      assertEqual(sorted[0].score, 10, 'highest score is 10 (id)');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsSelectElement() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('select');
    el.setAttribute('name', 'country');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var nameSel = sels.find(function(s) { return s.attr === 'name'; });
      assertTrue(nameSel !== undefined, 'select with name should produce name selector');
      assertEqual(nameSel.score, 8);
      assertTrue(nameSel.value.indexOf('select') >= 0, 'value includes tag');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsTextareaElement() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('textarea');
    el.setAttribute('name', 'message');
    el.setAttribute('placeholder', 'Type here');
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var nameSel = sels.find(function(s) { return s.attr === 'name'; });
      assertTrue(nameSel !== undefined, 'textarea with name should produce name selector');
      assertTrue(nameSel.value.indexOf('textarea') >= 0);
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsLongTextSkipped() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('button');
    el.textContent = 'x'.repeat(150);
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var textSel = sels.find(function(s) { return s.type === 'text'; });
      assertEqual(textSel, undefined, 'text > 100 chars should be skipped');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGenerateSelectorsStyledComponentClass() {
    var gen = global.CFS_selectors.generateSelectors;
    var el = document.createElement('div');
    el.className = 'sc-abc123def-0';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var scSel = sels.find(function(s) { return s.type === 'class' && s.value.indexOf('sc-') >= 0; });
      assertTrue(scSel !== undefined, 'styled-component class should produce fallback class selector');
      assertEqual(scSel.score, 4);
    } finally {
      document.body.removeChild(el);
    }
  }

  /* =========================================================================
   * selectors.js — findElementByCssStrings coverage
   * ========================================================================= */

  function testFindElementByCssStringsNull() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    assertEqual(fn(null, ['#x']), null, 'null doc');
    assertEqual(fn(document, null), null, 'null cssStrings');
    assertEqual(fn(document, []), null, 'empty cssStrings');
    assertEqual(fn(null, null), null, 'both null');
  }

  function testFindElementByCssStringsById() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    var el = document.createElement('div');
    el.id = 'cfs-find-test-id';
    document.body.appendChild(el);
    try {
      var found = fn(document, ['#cfs-find-test-id']);
      assertEqual(found, el, 'should find element by id');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testFindElementByCssStringsByClass() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    var el = document.createElement('div');
    el.className = 'cfs-unique-find-class';
    document.body.appendChild(el);
    try {
      var found = fn(document, ['.cfs-unique-find-class']);
      assertEqual(found, el, 'should find element by class');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testFindElementByCssStringsFallthrough() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    var el = document.createElement('div');
    el.className = 'cfs-fallthrough-target';
    document.body.appendChild(el);
    try {
      var found = fn(document, ['#nonexistent-xyz', '.cfs-fallthrough-target']);
      assertEqual(found, el, 'should fall through to second selector');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testFindElementByCssStringsNoMatch() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    var result = fn(document, ['#absolutely-not-present', '.also-missing-xyz']);
    assertEqual(result, null, 'no match returns null');
  }

  function testFindElementByCssStringsInvalidSelector() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    var result = fn(document, ['[invalid!!!syntax', '#also-missing']);
    assertEqual(result, null, 'invalid selectors handled gracefully');
  }

  function testFindElementByCssStringsFirstWins() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    var el1 = document.createElement('div');
    el1.id = 'cfs-first-wins';
    var el2 = document.createElement('div');
    el2.className = 'cfs-second-choice';
    document.body.appendChild(el1);
    document.body.appendChild(el2);
    try {
      var found = fn(document, ['#cfs-first-wins', '.cfs-second-choice']);
      assertEqual(found, el1, 'should return first matching element');
    } finally {
      document.body.removeChild(el1);
      document.body.removeChild(el2);
    }
  }

  function testFindElementByCssStringsAttrSelector() {
    var fn = global.CFS_selectors.findElementByCssStrings;
    var el = document.createElement('input');
    el.setAttribute('data-testid', 'cfs-email-input');
    document.body.appendChild(el);
    try {
      var found = fn(document, ['[data-testid="cfs-email-input"]']);
      assertEqual(found, el, 'should find by attribute selector');
    } finally {
      document.body.removeChild(el);
    }
  }

  /* =========================================================================
   * selectors.js — generatePrimaryAndFallbackSelectors coverage
   * ========================================================================= */

  function testGeneratePrimaryAndFallbackSelectorsEmpty() {
    var fn = global.CFS_selectors.generatePrimaryAndFallbackSelectors;
    if (!fn) throw new Error('generatePrimaryAndFallbackSelectors not loaded');
    var result = fn(null);
    assertDeepEqual(result.primary, []);
    assertDeepEqual(result.fallbacks, []);
  }

  function testGeneratePrimaryAndFallbackSelectorsSplit() {
    var fn = global.CFS_selectors.generatePrimaryAndFallbackSelectors;
    var el = document.createElement('button');
    el.id = 'cfs-split-test';
    el.setAttribute('data-testid', 'split');
    el.textContent = 'Click me';
    el.className = 'btn-split-test';
    document.body.appendChild(el);
    try {
      var result = fn(el);
      assertTrue(result.primary.length >= 1, 'should have at least one primary');
      assertTrue(result.fallbacks.length >= 1, 'should have fallbacks');
      assertTrue(result.primary[0].score >= result.fallbacks[0].score, 'primary score >= fallback score');
      var primaryKeys = result.primary.map(function(s) {
        return typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      });
      var hasDupe = result.fallbacks.some(function(s) {
        var k = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
        return primaryKeys.indexOf(k) >= 0;
      });
      assertFalse(hasDupe, 'fallbacks should not duplicate primary selectors');
    } finally {
      document.body.removeChild(el);
    }
  }

  function testGeneratePrimaryAndFallbackSelectorsCustomCount() {
    var fn = global.CFS_selectors.generatePrimaryAndFallbackSelectors;
    var el = document.createElement('button');
    el.id = 'cfs-count-test';
    el.setAttribute('data-testid', 'count');
    el.setAttribute('aria-label', 'Count test');
    el.textContent = 'Count';
    document.body.appendChild(el);
    try {
      var result = fn(el, { primaryCount: 3 });
      assertTrue(result.primary.length <= 3, 'primaryCount limits primary selectors');
      assertTrue(result.primary.length >= 1, 'at least one primary');
    } finally {
      document.body.removeChild(el);
    }
  }

  /* =========================================================================
   * selectors.js — roundtrip: generate → find
   * ========================================================================= */

  function testGenerateSelectorsRoundtripResolve() {
    var gen = global.CFS_selectors.generateSelectors;
    var findFn = global.CFS_selectors.findElementByCssStrings;
    var el = document.createElement('button');
    el.id = 'cfs-roundtrip-btn';
    el.setAttribute('data-testid', 'roundtrip');
    el.textContent = 'Roundtrip';
    document.body.appendChild(el);
    try {
      var sels = gen(el);
      var cssStrings = [];
      for (var i = 0; i < sels.length; i++) {
        if (typeof sels[i].value === 'string') cssStrings.push(sels[i].value);
      }
      assertTrue(cssStrings.length >= 1, 'should have CSS-string selectors');
      var found = findFn(document, cssStrings);
      assertEqual(found, el, 'roundtrip: generated selectors should find the original element');
    } finally {
      document.body.removeChild(el);
    }
  }

  /* =========================================================================
   * analyzer.js — comprehensive coverage
   * ========================================================================= */

  function testGetRunIndexForAction() {
    var fn = global.getRunIndexForAction;
    if (!fn) throw new Error('getRunIndexForAction not loaded');
    var a1 = { type: 'click' };
    var a2 = { type: 'type' };
    var a3 = { type: 'wait' };
    var runs = [[a1], [a2, a3]];
    assertEqual(fn(a1, runs), 0);
    assertEqual(fn(a2, runs), 1);
    assertEqual(fn(a3, runs), 1);
    assertEqual(fn({ type: 'unknown' }, runs), -1);
  }

  function testMergeConsecutiveWaits() {
    var fn = global.mergeConsecutiveWaits;
    if (!fn) throw new Error('mergeConsecutiveWaits not loaded');
    assertDeepEqual(fn(null), []);
    assertDeepEqual(fn([]), []);
    var noWaits = [{ type: 'click', selectors: [] }, { type: 'type', selectors: [] }];
    var result = fn(noWaits);
    assertEqual(result.length, 2);
    assertEqual(result[0].type, 'click');
  }

  function testMergeConsecutiveWaitsGrouping() {
    var fn = global.mergeConsecutiveWaits;
    var waits = [
      { type: 'wait', duration: 100 },
      { type: 'wait', duration: 200 },
      { type: 'click', selectors: [{ type: 'id', value: '#btn', score: 10 }] }
    ];
    var result = fn(waits);
    assertEqual(result.length, 2, 'two consecutive waits merge into one');
    assertEqual(result[0].type, 'wait');
    assertTrue(result[0].durationMin <= result[0].durationMax);
    assertEqual(result[0].waitFor, 'element', 'waitFor set when next action has selectors');
    assertTrue(result[0].waitForSelectors.length > 0);
    assertEqual(result[1].type, 'click');
  }

  function testMergeConsecutiveWaitsIncludesNextFallbackSelectors() {
    var fn = global.mergeConsecutiveWaits;
    var waits = [
      { type: 'wait', duration: 100 },
      {
        type: 'type',
        selectors: [{ type: 'id', value: '#stale', score: 10 }],
        fallbackSelectors: [
          { type: 'attr', attr: 'aria-label', value: '[aria-label="Search"]', score: 8 },
          { type: 'attr', attr: 'name', value: 'textarea[name="q"]', score: 8 },
        ],
      },
    ];
    var result = fn(waits);
    assertEqual(result.length, 2);
    assertEqual(result[0].waitFor, 'element');
    var wfs = result[0].waitForSelectors || [];
    assertTrue(wfs.length >= 3, 'wait should merge primary + fallback selectors');
    var vals = wfs.map(function(s) { return s && s.value; }).join(' ');
    assertTrue(vals.indexOf('stale') >= 0 && vals.indexOf('Search') >= 0, 'both primary id and aria fallback present');
  }

  function testMergeActionsNull() {
    var fn = global.mergeActions;
    if (!fn) throw new Error('mergeActions not loaded');
    assertEqual(fn(null), null);
    assertEqual(fn([]), null);
    assertEqual(fn([null, null]), null);
  }

  function testMergeActionsSingle() {
    var fn = global.mergeActions;
    var action = { type: 'click', selectors: [{ type: 'id', value: '#btn', score: 10 }], text: 'Save', url: 'https://x.com' };
    var result = fn([action]);
    assertEqual(result.type, 'click');
    assertEqual(result.text, 'Save');
    assertTrue(result.selectors.length > 0);
  }

  function testMergeActionsMultipleClicks() {
    var fn = global.mergeActions;
    var a = { type: 'click', selectors: [{ type: 'id', value: '#btn1', score: 10 }], text: 'Save', fallbackTexts: ['Save'] };
    var b = { type: 'click', selectors: [{ type: 'id', value: '#btn2', score: 8 }], text: 'Save', fallbackTexts: ['Submit'] };
    var result = fn([a, b]);
    assertEqual(result.type, 'click');
    assertTrue(result.selectors.length >= 1, 'selectors merged');
    assertTrue(result.fallbackTexts.length >= 1, 'fallback texts merged');
  }

  function testMergeActionsType() {
    var fn = global.mergeActions;
    var a = { type: 'type', selectors: [{ type: 'attr', value: '[name="email"]', score: 8 }], placeholder: 'Email', name: 'email' };
    var b = { type: 'type', selectors: [{ type: 'attr', value: '[name="email"]', score: 8 }], placeholder: 'Email', name: 'email' };
    var result = fn([a, b]);
    assertEqual(result.type, 'type');
    assertEqual(result.placeholder, 'Email');
    assertTrue(result.variableKey !== undefined);
    var x = { type: 'type', selectors: [{ type: 'id', value: '#q', score: 10 }], name: 'q', ariaLabel: 'Search', recordedValue: 'New ' };
    var y = { type: 'type', selectors: [{ type: 'id', value: '#q', score: 10 }], name: 'q', ariaLabel: 'Search', recordedValue: 'New Google Search' };
    var mergedTy = fn([x, y]);
    assertEqual(mergedTy.recordedValue, 'New Google Search', 'type merge keeps longest recordedValue');
    assertEqual(mergedTy.variableKey, 'Search', 'ariaLabel preferred over name for variable key');
    var dda = { type: 'type', name: 'q', ariaLabel: 'Search', selectors: [{ type: 'id', value: '#q', score: 10 }], isDropdownLike: true };
    var ddb = { type: 'type', name: 'q', ariaLabel: 'Search', selectors: [{ type: 'id', value: '#q', score: 10 }] };
    var mergedDrop = fn([dda, ddb]);
    assertTrue(mergedDrop.isDropdownLike === true, 'type merge preserves isDropdownLike');
  }

  function testMergeActionsHover() {
    var fn = global.mergeActions;
    var a = { type: 'mouseover', selectors: [{ type: 'id', value: '#menu', score: 10 }], text: 'Menu' };
    var result = fn([a]);
    assertEqual(result.type, 'hover', 'mouseover normalized to hover');
  }

  function testMergeActionsWait() {
    var fn = global.mergeActions;
    var a = { type: 'wait', duration: 500 };
    var b = { type: 'wait', duration: 1000 };
    var result = fn([a, b]);
    assertEqual(result.type, 'wait');
    assertEqual(result.duration, 1000, 'max duration');
    assertEqual(result.durationMin, 500, 'min duration');
  }

  function testMergeActionsUpload() {
    var fn = global.mergeActions;
    var a = { type: 'upload', selectors: [{ type: 'css', value: 'input[type=file]', score: 5 }], accept: '.jpg' };
    var result = fn([a]);
    assertEqual(result.type, 'upload');
    assertEqual(result.variableKey, 'fileUrl');
    assertEqual(result.accept, '.jpg');
  }

  function testMergeActionsSelect() {
    var fn = global.mergeActions;
    var a = { type: 'select', selectors: [{ type: 'attr', value: 'select[name="country"]', score: 8 }], name: 'country' };
    var result = fn([a]);
    assertEqual(result.type, 'select');
    assertEqual(result.variableKey, 'country');
  }

  function testMergeActionsDownload() {
    var fn = global.mergeActions;
    var a = { type: 'download', selectors: [], variableKey: 'myFile' };
    var result = fn([a]);
    assertEqual(result.type, 'download');
    assertEqual(result.variableKey, 'myFile');
  }

  function testMergeActionsGoToUrlOpenTabKey() {
    var fn = global.mergeActions;
    var g = fn([{ type: 'goToUrl', url: 'https://ex.com/a', urlRecordedFrom: 'link', timestamp: 1 }]);
    assertEqual(g.type, 'goToUrl');
    assertEqual(g.url, 'https://ex.com/a');
    assertEqual(g.urlRecordedFrom, 'link');
    var o = fn([{ type: 'openTab', url: 'https://ex.com/b', openInNewWindow: true, andSwitchToTab: false, timestamp: 1 }]);
    assertEqual(o.type, 'openTab');
    assertEqual(o.openInNewWindow, true);
    var k = fn([
      { type: 'key', key: 'Escape', count: 1, timestamp: 1 },
      { type: 'key', key: 'Escape', count: 2, timestamp: 2 },
    ]);
    assertEqual(k.type, 'key');
    assertEqual(k.key, 'Escape');
    assertEqual(k.count, 3);
  }

  function testMergeActionsScrollDragDrop() {
    var fn = global.mergeActions;
    var s = fn([
      { type: 'scroll', mode: 'delta', deltaX: 0, deltaY: 10, behavior: 'auto', settleMs: 100, timestamp: 1 },
      { type: 'scroll', mode: 'delta', deltaX: 0, deltaY: 5, timestamp: 2 },
    ]);
    assertEqual(s.type, 'scroll');
    assertEqual(s.deltaY, 15);
    var d = fn([
      {
        type: 'dragDrop',
        sourceSelectors: [{ type: 'id', value: '#a', score: 10 }],
        targetSelectors: [{ type: 'id', value: '#b', score: 10 }],
        steps: 12,
        stepDelayMs: 25,
        timestamp: 1,
      },
    ]);
    assertEqual(d.type, 'dragDrop');
    assertTrue(d.sourceSelectors.length >= 1);
  }

  function testMergeActionsClickSubmitIntent() {
    var fn = global.mergeActions;
    var r = fn([
      { type: 'click', selectors: [{ type: 'id', value: '#go', score: 10 }], submitIntent: true, timestamp: 1 },
    ]);
    assertTrue(r.submitIntent === true);
  }

  function testMergeActionsClickKeyboardActivation() {
    var fn = global.mergeActions;
    var r = fn([
      { type: 'click', selectors: [{ type: 'id', value: '#b', score: 10 }], keyboardActivation: 'Space', timestamp: 1 },
      { type: 'click', selectors: [{ type: 'id', value: '#b', score: 9 }], keyboardActivation: 'Space', timestamp: 2 },
    ]);
    assertEqual(r.keyboardActivation, 'Space');
  }

  function testMergeActionsEnsureSelect() {
    var fn = global.mergeActions;
    var a = { type: 'ensureSelect', expectedText: 'Option A', selectors: [], checkSelectors: [{ type: 'id', value: '#sel', score: 10 }], openSelectors: [], optionSelectors: [] };
    var result = fn([a]);
    assertEqual(result.type, 'ensureSelect');
    assertEqual(result.expectedText, 'Option A');
  }

  function testDeduplicateByField() {
    var fn = global.deduplicateByField;
    if (!fn) throw new Error('deduplicateByField not loaded');
    assertDeepEqual(fn(null), []);
    assertDeepEqual(fn([]), []);
    var a = { type: 'type', placeholder: 'Email', selectors: [{ type: 'id', value: '#e', score: 10 }] };
    var b = { type: 'type', placeholder: 'Email', selectors: [{ type: 'id', value: '#e2', score: 8 }] };
    var result = fn([a, b]);
    assertEqual(result.length, 1, 'duplicates by placeholder merged');
    assertTrue(result[0].selectors.length >= 1, 'selectors merged in dedup');
    var t1 = { type: 'type', name: 'q', selectors: [{ type: 'id', value: '#q', score: 10 }], recordedValue: 'New ' };
    var t2 = { type: 'type', name: 'q', selectors: [{ type: 'id', value: '#q', score: 10 }], recordedValue: 'New Google Search' };
    var dedupTypes = fn([t1, t2]);
    assertEqual(dedupTypes.length, 1);
    assertEqual(dedupTypes[0].recordedValue, 'New Google Search');
  }

  function testDeduplicateByFieldNoKey() {
    var fn = global.deduplicateByField;
    var a = { type: 'click', selectors: [] };
    var b = { type: 'click', selectors: [] };
    var result = fn([a, b]);
    assertEqual(result.length, 2, 'actions without key are not deduped');
  }

  function testDeduplicateByFieldUploadNotMerged() {
    var fn = global.deduplicateByField;
    var a = { type: 'upload', variableKey: 'file', selectors: [] };
    var b = { type: 'upload', variableKey: 'file', selectors: [] };
    var result = fn([a, b]);
    assertEqual(result.length, 2, 'uploads with same key are NOT merged (each is unique)');
  }

  function testInferVariableKey() {
    var fn = global.inferVariableKey;
    if (!fn) throw new Error('inferVariableKey not loaded');
    assertEqual(fn([]), 'value');
    assertEqual(fn([{ placeholder: 'Email' }, { placeholder: 'Email' }]), 'Email');
    assertEqual(fn([{ name: 'first_name' }]), 'first_name');
    assertEqual(fn([{ ariaLabel: 'Enter search' }]), 'Enter search');
    assertEqual(fn([{ name: 'q', ariaLabel: 'Search' }]), 'Search', 'ariaLabel wins over short name');
    var long = 'a'.repeat(50);
    assertEqual(fn([{ placeholder: long }]), 'prompt', 'long key truncated to prompt');
  }

  function testInferWaitAfter() {
    var fn = global.inferWaitAfter;
    if (!fn) throw new Error('inferWaitAfter not loaded');
    assertEqual(fn([]), null);
    assertEqual(fn([{ waitAfter: null }]), null);
    assertEqual(fn([{ waitAfter: 2000 }]), 2000);
    assertEqual(fn([{}, { waitAfter: 500 }]), 500);
  }

  function testInferUrlPattern() {
    var fn = global.inferUrlPattern;
    if (!fn) throw new Error('inferUrlPattern not loaded');
    assertEqual(fn([]), null);
    var runs = [{ actions: [{ url: 'https://example.com/page' }] }];
    var result = fn(runs);
    assertEqual(result.origin, 'https://example.com');
    assertEqual(result.pathPattern, '*');
  }

  function testInferUrlPatternNoActions() {
    var fn = global.inferUrlPattern;
    var runs = [{ actions: [{ type: 'click' }] }];
    assertEqual(fn(runs), null, 'no url in actions returns null');
  }

  function testMergeVariationBothNull() {
    var fn = global.mergeVariation;
    if (!fn) throw new Error('mergeVariation not loaded');
    assertEqual(fn(null, null), undefined);
    assertEqual(fn(undefined, undefined), undefined);
  }

  function testMergeVariationOneNull() {
    var fn = global.mergeVariation;
    var v = { runCount: 1, totalRuns: 2, optional: true, absentFromRuns: [1], selectorStability: [], stableSelectors: [], unstableSelectors: [] };
    assertEqual(fn(v, null), v);
    assertEqual(fn(null, v), v);
  }

  function testMergeVariationTwoValid() {
    var fn = global.mergeVariation;
    var a = { runCount: 1, totalRuns: 2, optional: true, absentFromRuns: [1], selectorStability: [{ type: 'id', value: '#a', score: 10, stability: 1 }], stableSelectors: [], unstableSelectors: [] };
    var b = { runCount: 1, totalRuns: 2, optional: true, absentFromRuns: [0], selectorStability: [{ type: 'id', value: '#b', score: 8, stability: 0.5 }], stableSelectors: [], unstableSelectors: [] };
    var result = fn(a, b);
    assertEqual(result.totalRuns, 2);
    assertEqual(result.runCount, 2, 'both present in different runs = 2');
    assertTrue(result.selectorStability.length >= 2, 'merged selector stability');
  }

  function testMergePageState() {
    var fn = global.mergePageState;
    if (!fn) throw new Error('mergePageState not loaded');
    assertEqual(fn(null), undefined);
    assertEqual(fn([]), undefined);
    var states = [{ counts: { buttons: 3, links: 5 } }, { counts: { buttons: 5, images: 2 } }];
    var result = fn(states);
    assertEqual(result.counts.buttons, 5, 'max of buttons');
    assertEqual(result.counts.links, 5);
    assertEqual(result.counts.images, 2);
  }

  function testMergePageStateNoCounts() {
    var fn = global.mergePageState;
    var result = fn([{ noCount: true }]);
    assertDeepEqual(result, { noCount: true }, 'first without counts returned as-is');
  }

  function testNormalizeState() {
    var fn = global.normalizeState;
    if (!fn) throw new Error('normalizeState not loaded');
    assertDeepEqual(fn(null), []);
    assertDeepEqual(fn([]), []);
    var result = fn([{ displayedValue: '  Hello  ' }, { displayedValue: '' }]);
    assertEqual(result.length, 1, 'empty values filtered');
    assertEqual(result[0].v, 'hello');
  }

  function testStatesOverlap() {
    var fn = global.statesOverlap;
    if (!fn) throw new Error('statesOverlap not loaded');
    var starts = [[{ v: 'a' }, { v: 'b' }]];
    var ends = [[{ v: 'b' }, { v: 'c' }]];
    assertTrue(fn(starts, ends), 'b overlaps');
    var noOverlap = [[{ v: 'x' }]];
    assertFalse(fn(starts, noOverlap), 'no overlap');
  }

  function testDetectLoopableWorkflowNull() {
    var fn = global.detectLoopableWorkflow;
    if (!fn) throw new Error('detectLoopableWorkflow not loaded');
    assertEqual(fn(null), null);
    assertEqual(fn([]), null);
  }

  function testDetectLoopableWorkflowUrlSame() {
    var fn = global.detectLoopableWorkflow;
    var runs = [
      { actions: [{ url: 'https://x.com/page', type: 'click' }], startState: [], endState: [], url: 'https://x.com/page' }
    ];
    var result = fn(runs);
    assertTrue(result.loopable, 'same start/end URL is loopable');
    assertTrue(result.urlSame);
  }

  function testDetectLoopableWorkflowUrlDifferent() {
    var fn = global.detectLoopableWorkflow;
    var runs = [
      { actions: [{ url: 'https://x.com/a', type: 'click' }, { url: 'https://x.com/b', type: 'click' }], startState: [], endState: [], url: 'https://x.com/a' },
      { actions: [{ url: 'https://x.com/a', type: 'click' }, { url: 'https://x.com/c', type: 'click' }], startState: [], endState: [], url: 'https://x.com/a' }
    ];
    var result = fn(runs);
    assertFalse(result.urlSame, 'different end URLs not urlSame');
  }

  function testDetectConditionalDropdownsNull() {
    var fn = global.detectConditionalDropdowns;
    if (!fn) throw new Error('detectConditionalDropdowns not loaded');
    assertEqual(fn(null), null);
    assertEqual(fn([]), null);
  }

  function testDetectConditionalDropdownsNoDropdown() {
    var fn = global.detectConditionalDropdowns;
    var runs = [{ actions: [{ type: 'click', text: 'Submit' }] }];
    assertEqual(fn(runs), null, 'no dropdown sequence = null');
  }

  function testDetectConditionalDropdownsWithDropdown() {
    var fn = global.detectConditionalDropdowns;
    var runs = [{
      actions: [{
        type: 'click',
        selectors: [{ type: 'id', value: '#sel', score: 10 }],
        _dropdownSequence: { optionText: 'Option B', toValue: 'B', optionSelectors: [{ type: 'text', value: 'Option B', score: 5 }] }
      }]
    }];
    var result = fn(runs);
    assertTrue(result !== null, 'detected dropdown');
    assertEqual(result.type, 'ensureSelect');
    assertEqual(result.expectedText, 'Option B');
  }

  function testReorderSelectorsByStability() {
    var fn = global.reorderSelectorsByStability;
    if (!fn) throw new Error('reorderSelectorsByStability not loaded');
    var selectors = [
      { type: 'id', value: '#a', score: 10 },
      { type: 'css', value: '.b', score: 5 }
    ];
    var stability = [
      { type: 'css', value: '.b', stability: 1.0 },
      { type: 'id', value: '#a', stability: 0.3 }
    ];
    var result = fn(selectors, stability);
    assertEqual(result[0].value, '.b', 'higher stability first');
    assertEqual(result[1].value, '#a');
  }

  function testReorderSelectorsByStabilityEmpty() {
    var fn = global.reorderSelectorsByStability;
    assertEqual(fn(null, []), null);
    assertEqual(fn([], null).length, 0);
  }

  function testApplyExpectedBeforeAfter() {
    var fn = global.applyExpectedBeforeAfter;
    if (!fn) throw new Error('applyExpectedBeforeAfter not loaded');
    fn(null);
    fn([]);
    var actions = [
      { type: 'click', selectors: [{ type: 'id', value: '#a', score: 10 }] },
      { type: 'type', selectors: [{ type: 'id', value: '#b', score: 8 }] },
      { type: 'click', selectors: [{ type: 'id', value: '#c', score: 7 }] }
    ];
    fn(actions);
    assertEqual(actions[0].expectedBefore, undefined, 'first has no expectedBefore');
    assertTrue(actions[0].expectedAfter.length > 0, 'first has expectedAfter from second');
    assertTrue(actions[1].expectedBefore.length > 0, 'second has expectedBefore from first');
    assertTrue(actions[1].expectedAfter.length > 0, 'second has expectedAfter from third');
    assertTrue(actions[2].expectedBefore.length > 0, 'third has expectedBefore from second');
    assertEqual(actions[2].expectedAfter, undefined, 'last has no expectedAfter');
  }

  function testComputeSelectorStabilityFromActionsWithRuns() {
    var fn = global.computeSelectorStabilityFromActionsWithRuns;
    if (!fn) throw new Error('computeSelectorStabilityFromActionsWithRuns not loaded');
    assertDeepEqual(fn(null), []);
    assertDeepEqual(fn([]), []);
    var actionsWithRuns = [
      { action: { selectors: [{ type: 'id', value: '#btn', score: 10 }] }, runIdx: 0 },
      { action: { selectors: [{ type: 'id', value: '#btn', score: 10 }, { type: 'css', value: '.cls', score: 5 }] }, runIdx: 1 }
    ];
    var result = fn(actionsWithRuns);
    assertTrue(result.length >= 1);
    var btn = result.find(function(s) { return s.value === '#btn'; });
    assertTrue(btn !== undefined, '#btn found');
    assertEqual(btn.runCount, 2);
    assertEqual(btn.stability, 1);
    var cls = result.find(function(s) { return s.value === '.cls'; });
    assertTrue(cls !== undefined, '.cls found');
    assertEqual(cls.runCount, 1);
    assertEqual(cls.stability, 0.5);
  }

  function testComputeVariationForColumn() {
    var fn = global.computeVariationForColumn;
    if (!fn) throw new Error('computeVariationForColumn not loaded');
    var a1 = { type: 'click', selectors: [{ type: 'id', value: '#x', score: 10 }] };
    var a2 = { type: 'click', selectors: [{ type: 'id', value: '#x', score: 10 }] };
    var runActions = [[a1], [a2]];
    var result = fn([a1, a2], runActions, 2);
    assertEqual(result.runCount, 2);
    assertEqual(result.totalRuns, 2);
    assertFalse(result.optional);
    assertEqual(result.absentFromRuns.length, 0);
  }

  function testComputeVariationForColumnOptional() {
    var fn = global.computeVariationForColumn;
    var a1 = { type: 'click', selectors: [] };
    var runActions = [[a1], [{ type: 'type' }]];
    var result = fn([a1], runActions, 2);
    assertEqual(result.runCount, 1);
    assertTrue(result.optional);
    assertEqual(result.absentFromRuns.length, 1);
  }

  function testMergeFallbackTextsExtended() {
    var fn = global.mergeFallbackTexts;
    assertDeepEqual(fn(['a']), [], 'single char excluded (< 2)');
    assertDeepEqual(fn(['ab']), ['ab'], '2 chars included');
    var long = 'x'.repeat(60);
    assertDeepEqual(fn([long]), [], 'over 50 chars excluded');
    var many = [];
    for (var i = 0; i < 20; i++) many.push('text' + i);
    var result = fn(many);
    assertTrue(result.length <= 8, 'max 8 items');
  }

  function testMergeSingleRun() {
    var fn = global.mergeSingleRun;
    if (!fn) throw new Error('mergeSingleRun not loaded');
    assertEqual(fn(null), null);
    assertEqual(fn({}), null);
    assertEqual(fn({ actions: [] }), null);
    var run = {
      url: 'https://example.com/page',
      actions: [
        { type: 'click', selectors: [{ type: 'id', value: '#btn', score: 10 }], url: 'https://example.com/page' },
        { type: 'type', selectors: [{ type: 'attr', value: '[name="q"]', score: 8 }], placeholder: 'Search' }
      ],
      startState: [],
      endState: []
    };
    var result = fn(run);
    assertTrue(result !== null);
    assertEqual(result.runCount, 1);
    assertTrue(result.actions.length >= 2);
    assertTrue(result.urlPattern !== null);
    assertEqual(result.urlPattern.origin, 'https://example.com');
  }

  function testMergeSingleRunAugmentsFallbacksFromMeta() {
    var fn = global.mergeSingleRun;
    if (!fn) throw new Error('mergeSingleRun not loaded');
    var run = {
      url: 'https://www.google.com/',
      actions: [
        { type: 'wait', duration: 500, url: 'https://www.google.com/' },
        {
          type: 'type',
          selectors: [{ type: 'id', value: '#gone', score: 10 }],
          name: 'q',
          ariaLabel: 'Search',
          recordedValue: 'x',
          url: 'https://www.google.com/',
        },
      ],
      startState: [],
      endState: [],
    };
    var result = fn(run);
    assertTrue(result && result.actions && result.actions.length >= 1);
    var typeStep = result.actions.find(function(a) { return a.type === 'type'; });
    assertTrue(typeStep && typeStep.fallbackSelectors && typeStep.fallbackSelectors.length >= 1);
    var joined = (typeStep.fallbackSelectors || []).map(function(s) { return (s && s.value) ? String(s.value) : ''; }).join(' ');
    assertTrue(joined.indexOf('q') >= 0 && joined.indexOf('Search') >= 0);
    var waitStep = result.actions.find(function(a) { return a.type === 'wait' && a.waitFor === 'element'; });
    if (waitStep && waitStep.waitForSelectors) {
      var wj = waitStep.waitForSelectors.map(function(s) { return (s && s.value) ? String(s.value) : ''; }).join(' ');
      assertTrue(wj.indexOf('Search') >= 0 || wj.indexOf('q') >= 0, 'merged wait should include meta fallbacks');
    }
  }

  function testAnalyzeRunsEmpty() {
    var fn = global.analyzeRuns;
    if (!fn) throw new Error('analyzeRuns not loaded');
    assertEqual(fn(null), null);
    assertEqual(fn([]), null);
    assertEqual(fn([{ actions: [] }]), null);
  }

  function testAnalyzeRunsSingleRun() {
    var fn = global.analyzeRuns;
    var run = {
      url: 'https://example.com',
      actions: [
        { type: 'click', selectors: [{ type: 'id', value: '#a', score: 10 }], text: 'Click', url: 'https://example.com' }
      ],
      startState: [],
      endState: []
    };
    var result = fn([run]);
    assertTrue(result !== null);
    assertEqual(result.runCount, 1);
    assertTrue(result.actions.length >= 1);
    assertEqual(result.actions[0].type, 'click');
  }

  function testAnalyzeRunsMultiRun() {
    var fn = global.analyzeRuns;
    var run1 = {
      url: 'https://x.com',
      actions: [
        { type: 'click', selectors: [{ type: 'id', value: '#btn', score: 10 }], text: 'Save', url: 'https://x.com' },
        { type: 'type', selectors: [{ type: 'attr', value: '[name="q"]', score: 8 }], placeholder: 'Search', url: 'https://x.com' }
      ],
      startState: [],
      endState: []
    };
    var run2 = {
      url: 'https://x.com',
      actions: [
        { type: 'click', selectors: [{ type: 'id', value: '#btn', score: 10 }], text: 'Save', url: 'https://x.com' },
        { type: 'type', selectors: [{ type: 'attr', value: '[name="q"]', score: 8 }], placeholder: 'Search', url: 'https://x.com' }
      ],
      startState: [],
      endState: []
    };
    var result = fn([run1, run2]);
    assertTrue(result !== null);
    assertEqual(result.runCount, 2);
    assertTrue(result.actions.length >= 2);
  }

  function testAlignRunsBySimilarity() {
    var fn = global.alignRunsBySimilarity;
    if (!fn) throw new Error('alignRunsBySimilarity not loaded');
    assertDeepEqual(fn(null), []);
    assertDeepEqual(fn([]), []);
    var a = { type: 'click', selectors: [{ type: 'id', value: '#a', score: 10 }] };
    var b = { type: 'click', selectors: [{ type: 'id', value: '#a', score: 10 }] };
    var result = fn([[a], [b]]);
    assertTrue(result.length >= 1, 'aligned at least one column');
  }

  function testFindBestInsertPosition() {
    var fn = global.findBestInsertPosition;
    if (!fn) throw new Error('findBestInsertPosition not loaded');
    var aligned = [[{ type: 'click' }], [{ type: 'type' }]];
    var action = { type: 'wait' };
    var sim = function() { return 0; };
    var pos = fn(aligned, action, sim, 0, 1, 2);
    assertTrue(pos >= 0 && pos <= aligned.length);
  }

  function testApplyVariationToActions() {
    var fn = global.applyVariationToActions;
    if (!fn) throw new Error('applyVariationToActions not loaded');
    fn(null);
    fn([]);
    var actions = [{
      type: 'click',
      selectors: [
        { type: 'id', value: '#a', score: 10 },
        { type: 'css', value: '.b', score: 5 }
      ],
      _variation: {
        selectorStability: [
          { type: 'css', value: '.b', stability: 1.0 },
          { type: 'id', value: '#a', stability: 0.3 }
        ]
      }
    }];
    fn(actions);
    assertEqual(actions[0].selectors[0].value, '.b', 'stable selector moved first');
  }

  /* =========================================================================
   * book-builder.js — comprehensive coverage
   * ========================================================================= */

  function testBookBuilderTrimPresets() {
    var bb = global.__CFS_bookBuilder;
    if (!bb) throw new Error('__CFS_bookBuilder not loaded');
    assertTrue(bb.TRIM_PRESETS !== undefined);
    assertTrue(Object.keys(bb.TRIM_PRESETS).length >= 8);
    assertEqual(bb.TRIM_PRESETS['6x9'].w, 6);
    assertEqual(bb.TRIM_PRESETS['6x9'].h, 9);
    assertEqual(bb.TRIM_PRESETS['custom'].w, null);
  }

  function testBookBuilderGetOptionsDefault() {
    var bb = global.__CFS_bookBuilder;
    var opts = bb.getOptions({});
    assertEqual(opts.trimWidthIn, 6);
    assertEqual(opts.trimHeightIn, 9);
    assertEqual(opts.screenshotPosition, 'above');
    assertTrue(opts.keepStepTogether);
    assertTrue(opts.footerPageNumbers);
    assertEqual(opts.fontSizePt, 11);
  }

  function testBookBuilderGetOptionsCustom() {
    var bb = global.__CFS_bookBuilder;
    var opts = bb.getOptions({ trimSizePreset: 'custom', trimWidthIn: 7.5, trimHeightIn: 10, marginInsideIn: 1, fontSizePt: 14, screenshotPosition: 'left', keepStepTogether: false, footerPageNumbers: false });
    assertEqual(opts.trimWidthIn, 7.5);
    assertEqual(opts.trimHeightIn, 10);
    assertEqual(opts.marginInside, 1);
    assertEqual(opts.fontSizePt, 14);
    assertEqual(opts.screenshotPosition, 'left');
    assertFalse(opts.keepStepTogether);
    assertFalse(opts.footerPageNumbers);
  }

  function testBookBuilderGetOptionsPreset() {
    var bb = global.__CFS_bookBuilder;
    var opts = bb.getOptions({ trimSizePreset: '8.5x11' });
    assertEqual(opts.trimWidthIn, 8.5);
    assertEqual(opts.trimHeightIn, 11);
    assertEqual(opts.maxPages, 590);
  }

  function testBookBuilderGetOptionsClamping() {
    var bb = global.__CFS_bookBuilder;
    var opts = bb.getOptions({ marginInsideIn: 999, fontSizePt: 0.5 });
    assertEqual(opts.marginInside, 2, 'clamped to max 2');
    assertEqual(opts.fontSizePt, 8, 'clamped to min 8');
  }

  function testBookBuilderBuildMarkdown() {
    var bb = global.__CFS_bookBuilder;
    var wf = { name: 'My Guide' };
    var actions = [
      { type: 'click', comment: { text: 'Click the button' } },
      { type: 'type', stepLabel: 'Enter email' }
    ];
    var md = bb.buildMarkdown(wf, actions);
    assertTrue(md.indexOf('# My Guide') >= 0, 'title present');
    assertTrue(md.indexOf('Step 1: Click the button') >= 0, 'step 1');
    assertTrue(md.indexOf('Step 2: Enter email') >= 0, 'step 2');
    assertTrue(md.indexOf('Click the button') >= 0, 'body text');
  }

  function testBookBuilderBuildMarkdownNoComment() {
    var bb = global.__CFS_bookBuilder;
    var wf = { name: 'Test' };
    var actions = [{ type: 'click' }];
    var md = bb.buildMarkdown(wf, actions);
    assertTrue(md.indexOf('Step 1') >= 0);
  }

  function testBookBuilderBuildHtml() {
    var bb = global.__CFS_bookBuilder;
    var wf = { name: 'Test WF' };
    var actions = [{ type: 'click', comment: { text: 'Do the thing' } }];
    var html = bb.buildHtml(wf, actions);
    assertTrue(html.indexOf('<!DOCTYPE html>') === 0, 'starts with DOCTYPE');
    assertTrue(html.indexOf('<h1>Test WF</h1>') >= 0, 'title');
    assertTrue(html.indexOf('Step 1') >= 0, 'step number');
    assertTrue(html.indexOf('Do the thing') >= 0, 'body text');
    assertTrue(html.indexOf('book-step') >= 0, 'step class');
  }

  function testBookBuilderBuildHtmlEscaping() {
    var bb = global.__CFS_bookBuilder;
    var wf = { name: 'Test <script>alert(1)</script>' };
    var actions = [];
    var html = bb.buildHtml(wf, actions);
    assertTrue(html.indexOf('<script>alert(1)</script>') < 0, 'no unescaped script');
    assertTrue(html.indexOf('&lt;script&gt;') >= 0, 'script tag escaped');
  }

  function testBookBuilderBuildHtmlForDoc() {
    var bb = global.__CFS_bookBuilder;
    var wf = { name: 'Doc' };
    var html = bb.buildHtml(wf, [{ type: 'click' }], null, false, true);
    assertTrue(html.indexOf('urn:schemas-microsoft-com:office:word') >= 0, 'Word namespace');
    assertTrue(html.indexOf('ProgId') >= 0, 'Word ProgId');
  }

  function testBookBuilderBuildHtmlPositions() {
    var bb = global.__CFS_bookBuilder;
    var wf = { name: 'T' };
    var actions = [{ type: 'click' }];
    var htmlLeft = bb.buildHtml(wf, actions, bb.getOptions({ screenshotPosition: 'left' }));
    assertTrue(htmlLeft.indexOf('flex-direction:row') >= 0, 'left = row layout');
    var htmlBelow = bb.buildHtml(wf, actions, bb.getOptions({ screenshotPosition: 'below' }));
    assertTrue(htmlBelow.indexOf('flex-direction:column') >= 0, 'below = column layout');
  }

  function testBookBuilderBuildHtmlHeaderFooter() {
    var bb = global.__CFS_bookBuilder;
    var wf = { name: 'T' };
    var html = bb.buildHtml(wf, [], bb.getOptions({ headerText: 'My Header', footerText: 'My Footer' }));
    assertTrue(html.indexOf('My Header') >= 0, 'header present');
    assertTrue(html.indexOf('My Footer') >= 0, 'footer present');
    assertTrue(html.indexOf('book-pagenum') >= 0, 'page number counter');
  }

  function testBookBuilderGenerateBookExportMarkdown() {
    var bb = global.__CFS_bookBuilder;
    var wf = JSON.stringify({ name: 'Test', analyzed: { actions: [{ type: 'click', comment: { text: 'Click it' } }] } });
    return bb.generateBookExport({ workflowJson: wf, outputFormat: 'markdown' }).then(function(result) {
      assertEqual(result.type, 'text');
      assertTrue(result.data.indexOf('# Test') >= 0);
      assertTrue(result.data.indexOf('Click it') >= 0);
    });
  }

  function testBookBuilderGenerateBookExportHtml() {
    var bb = global.__CFS_bookBuilder;
    var wf = JSON.stringify({ name: 'Test', analyzed: { actions: [{ type: 'click' }] } });
    return bb.generateBookExport({ workflowJson: wf, outputFormat: 'html' }).then(function(result) {
      assertEqual(result.type, 'text');
      assertTrue(result.data.indexOf('<!DOCTYPE html>') >= 0);
    });
  }

  function testBookBuilderGenerateBookExportPdf() {
    var bb = global.__CFS_bookBuilder;
    var wf = JSON.stringify({ name: 'Test', actions: [{ type: 'click' }] });
    return bb.generateBookExport({ workflowJson: wf, outputFormat: 'pdf' }).then(function(result) {
      assertEqual(result.type, 'text');
      assertTrue(result.data.indexOf('Print this file') >= 0 || result.data.indexOf('<!DOCTYPE') >= 0, 'pdf comment or html');
    });
  }

  function testBookBuilderGenerateBookExportDoc() {
    var bb = global.__CFS_bookBuilder;
    var wf = JSON.stringify({ name: 'Test', analyzed: { actions: [{ type: 'click' }] } });
    return bb.generateBookExport({ workflowJson: wf, outputFormat: 'doc' }).then(function(result) {
      assertEqual(result.type, 'text');
      assertTrue(result.data.indexOf('Save with .doc') >= 0 || result.data.indexOf('urn:schemas-microsoft-com') >= 0);
    });
  }

  function testBookBuilderGenerateBookExportStepText() {
    var bb = global.__CFS_bookBuilder;
    return bb.generateBookExport({ stepText: 'Custom text here' }).then(function(result) {
      assertEqual(result.data, 'Custom text here');
    });
  }

  function testBookBuilderGenerateBookExportEmpty() {
    var bb = global.__CFS_bookBuilder;
    return bb.generateBookExport({}).then(function(result) {
      assertEqual(result.data, '');
    });
  }

  function testBookBuilderGenerateBookExportNoActions() {
    var bb = global.__CFS_bookBuilder;
    var wf = JSON.stringify({ name: 'Empty WF', analyzed: { actions: [] } });
    return bb.generateBookExport({ workflowJson: wf }).then(function(result) {
      assertTrue(result.data.indexOf('No steps') >= 0);
    });
  }

  function testBookBuilderGenerateBookExportInvalidJson() {
    var bb = global.__CFS_bookBuilder;
    return bb.generateBookExport({ workflowJson: 'not json{{' }).then(function(result) {
      assertTrue(result.data.indexOf('Error') >= 0);
    });
  }

  /* =========================================================================
   * walkthrough-export.js — additional coverage
   * ========================================================================= */

  function testWalkthroughBuildRunnerScript() {
    var fn = global.CFS_walkthroughExport && global.CFS_walkthroughExport.buildWalkthroughRunnerScript;
    if (!fn) throw new Error('buildWalkthroughRunnerScript not loaded');
    var script = fn();
    assertTrue(typeof script === 'string');
    assertTrue(script.indexOf('__CFS_WALKTHROUGH_CONFIG') >= 0);
    assertTrue(script.indexOf('function show()') >= 0);
    assertTrue(script.indexOf('function next()') >= 0);
    assertTrue(script.indexOf('function prev()') >= 0);
    assertTrue(script.indexOf('function destroy()') >= 0);
  }

  function testWalkthroughBuildRunnerScriptWithConfig() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughRunnerScript;
    var config = { name: 'Test', workflowId: 'w1', steps: [{ index: 1, type: 'click', selectors: ['#btn'], tooltip: 'Click me' }] };
    var script = fn(config);
    assertTrue(script.indexOf('"name":"Test"') >= 0, 'config inlined');
    assertTrue(script.indexOf('"workflowId":"w1"') >= 0);
  }

  function testWalkthroughBuildRunnerScriptCustomVar() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughRunnerScript;
    var script = fn(null, 'MY_CONFIG');
    assertTrue(script.indexOf('MY_CONFIG') >= 0, 'custom var name used');
  }

  function testWalkthroughBuildConfigWithCommentParts() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughConfig;
    var wf = {
      name: 'Parts Test', id: 'pt1',
      analyzed: { actions: [{ type: 'click', comment: { text: 'Hello', images: [{ url: 'img.png' }], mediaOrder: ['text', 'images'] } }] }
    };
    var cfg = fn(wf, { includeCommentParts: true });
    assertTrue(cfg.steps[0].commentParts !== undefined, 'commentParts included');
    assertTrue(cfg.steps[0].commentParts.length >= 1);
    assertEqual(cfg.steps[0].commentParts[0].type, 'text');
  }

  function testWalkthroughBuildConfigWithQuiz() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughConfig;
    var wf = {
      name: 'Quiz Test', id: 'qt1',
      analyzed: { actions: [{ type: 'click', comment: { text: 'This is a long tooltip text for quiz' }, selectors: ['#btn'] }] }
    };
    var cfg = fn(wf, { includeQuiz: true });
    assertTrue(cfg.steps[0].quizQuestion !== undefined, 'quizQuestion added');
  }

  function testWalkthroughBuildConfigNoActions() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughConfig;
    var cfg = fn({ name: 'Empty' });
    assertEqual(cfg.steps.length, 0);
    assertEqual(cfg.name, 'Empty');
  }

  function testWalkthroughBuildConfigFallbackTooltip() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughConfig;
    var wf = { name: 'T', id: 'x', analyzed: { actions: [{ type: 'click' }] } };
    var cfg = fn(wf);
    assertEqual(cfg.steps[0].tooltip, 'click 1', 'fallback tooltip is type + index');
  }

  /* =========================================================================
   * run-variation.js — coverage
   * ========================================================================= */

  function testRunVariationSelectorStabilityBasic() {
    var fn = global.selectorStability;
    if (!fn) throw new Error('selectorStability not loaded');
    assertDeepEqual(fn(null), []);
    assertDeepEqual(fn([]), []);
  }

  function testRunVariationSelectorStabilityWithData() {
    var fn = global.selectorStability;
    var data = [
      { action: { selectors: [{ type: 'id', value: '#a', score: 10 }] }, runIdx: 0 },
      { action: { selectors: [{ type: 'id', value: '#a', score: 10 }] }, runIdx: 1 }
    ];
    var result = fn(data);
    assertTrue(result.length >= 1);
    assertEqual(result[0].stability, 1, 'selector in both runs has stability 1');
  }

  function testRunVariationAnalyzeNull() {
    var fn = global.analyzeRunVariations;
    if (!fn) throw new Error('analyzeRunVariations not loaded');
    assertEqual(fn(null), null);
    assertEqual(fn([]), null);
    assertEqual(fn([{ actions: [] }]), null);
  }

  function testRunVariationAnalyzeBasic() {
    var fn = global.analyzeRunVariations;
    var a1 = { type: 'click', selectors: [{ type: 'id', value: '#btn', score: 10 }] };
    var a2 = { type: 'click', selectors: [{ type: 'id', value: '#btn', score: 10 }] };
    var runs = [{ actions: [a1] }, { actions: [a2] }];
    var result = fn(runs);
    assertTrue(result !== null, 'non-null result');
    assertEqual(result.runCount, 2);
    assertTrue(result.stepCount >= 1);
    assertTrue(result.stepReports.length >= 1);
    assertTrue(result.orderStable, 'single-step order is stable');
    assertEqual(result.optionalCount, 0, 'both present = required');
  }

  function testRunVariationAnalyzeOptionalStep() {
    var fn = global.analyzeRunVariations;
    var a1 = { type: 'click', selectors: [{ type: 'id', value: '#a', score: 10 }] };
    var a2 = { type: 'click', selectors: [{ type: 'id', value: '#a', score: 10 }] };
    var a3 = { type: 'type', selectors: [{ type: 'attr', value: '[name=q]', score: 8 }], placeholder: 'Search' };
    var runs = [{ actions: [a1, a3] }, { actions: [a2] }];
    var result = fn(runs);
    assertTrue(result !== null);
    assertTrue(result.optionalCount >= 1, 'type step only in run 1 should be optional');
  }

  /* =========================================================================
   * workflow-setup-constants.js — structure validation
   * ========================================================================= */

  function testWorkflowSetupConstantsStructure() {
    var c = global.WorkflowSetupConstants;
    if (!c) throw new Error('WorkflowSetupConstants not loaded');
    assertTrue(Array.isArray(c.MONETIZATION_OPTIONS));
    assertTrue(c.MONETIZATION_OPTIONS.length >= 5);
    assertTrue(c.MONETIZATION_OPTIONS.every(function(o) { return o.id && o.label; }), 'each option has id and label');
  }

  function testWorkflowSetupConstantsPlatforms() {
    var c = global.WorkflowSetupConstants;
    assertTrue(Array.isArray(c.PLATFORM_OPTIONS));
    assertTrue(c.PLATFORM_OPTIONS.length >= 10);
    assertTrue(c.PLATFORM_OPTIONS.every(function(o) { return o.id && o.label; }));
    var ids = c.PLATFORM_OPTIONS.map(function(o) { return o.id; });
    assertTrue(ids.indexOf('youtube') >= 0, 'youtube present');
    assertTrue(ids.indexOf('facebook') >= 0, 'facebook present');
  }

  function testWorkflowSetupConstantsUpgradePlans() {
    var c = global.WorkflowSetupConstants;
    assertTrue(Array.isArray(c.UPGRADE_PLANS));
    assertEqual(c.UPGRADE_PLANS.length, 2);
    assertEqual(c.UPGRADE_PLANS[0].id, 'starter');
    assertEqual(c.UPGRADE_PLANS[1].id, 'pro');
    assertTrue(c.UPGRADE_PLANS[0].price < c.UPGRADE_PLANS[1].price, 'starter cheaper than pro');
    assertTrue(c.UPGRADE_PLANS[1].maxAccounts > c.UPGRADE_PLANS[0].maxAccounts, 'pro has more accounts');
  }

  function testWorkflowSetupConstantsCategories() {
    var c = global.WorkflowSetupConstants;
    assertTrue(Array.isArray(c.WORKFLOW_CATEGORIES));
    assertTrue(c.WORKFLOW_CATEGORIES.length >= 4);
    assertTrue(c.WORKFLOW_CATEGORIES.every(function(o) { return o.id && o.label; }));
  }

  function testWorkflowSetupConstantsStorageKey() {
    var c = global.WorkflowSetupConstants;
    assertEqual(typeof c.WORKFLOW_SETUP_STORAGE_KEY, 'string');
    assertTrue(c.WORKFLOW_SETUP_STORAGE_KEY.length > 0);
  }

  function testWorkflowSetupConstantsUpgradePlatforms() {
    var c = global.WorkflowSetupConstants;
    assertTrue(Array.isArray(c.UPGRADE_PLATFORMS));
    assertTrue(c.UPGRADE_PLATFORMS.length >= 5);
    assertTrue(c.UPGRADE_PLATFORMS.indexOf('TikTok') >= 0);
    assertTrue(c.UPGRADE_PLATFORMS.indexOf('YouTube') >= 0);
  }

  /* =========================================================================
   * template-resolver.js — additional edge cases
   * ========================================================================= */

  function testTemplateResolverMultipleVars() {
    var r = global.CFS_templateResolver.resolveTemplate;
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    assertEqual(r('{{a}} and {{b}}', { a: 'X', b: 'Y' }, getRow), 'X and Y');
  }

  function testTemplateResolverNestedPathVar() {
    var r = global.CFS_templateResolver.resolveTemplate;
    function getRow(row, k) {
      var g = global.CFS_templateResolver.getByPath;
      return g ? g(row, k) : (row != null && row[k] !== undefined ? row[k] : '');
    }
    assertEqual(r('{{user.name}}', { user: { name: 'John' } }, getRow), 'John');
  }

  function testTemplateResolverNoTemplates() {
    var r = global.CFS_templateResolver.resolveTemplate;
    function getRow() { return ''; }
    assertEqual(r('plain text', {}, getRow), 'plain text');
  }

  function testGetByPathDeep() {
    var g = global.CFS_templateResolver.getByPath;
    assertEqual(g(null, 'x'), null);
    assertEqual(g(undefined, 'x'), undefined);
    assertEqual(g({ a: { b: { c: { d: 42 } } } }, 'a.b.c.d'), 42);
    assertDeepEqual(g({ a: [1, 2, 3] }, 'a'), [1, 2, 3]);
  }

  function testGetByLoosePathNested() {
    var gl = global.CFS_templateResolver && global.CFS_templateResolver.getByLoosePath;
    if (!gl) throw new Error('getByLoosePath not loaded');
    var row = { api: { stats: { views: 7 } } };
    assertEqual(gl(row, 'api.stats.views'), 7);
    assertEqual(gl({ items: [{ n: 1 }, { n: 9 }] }, 'items[1].n'), 9);
  }

  function testRunIfConditionComparisonGt() {
    var ev = global.CFS_runIfCondition && global.CFS_runIfCondition.evaluate;
    if (!ev) throw new Error('CFS_runIfCondition not loaded');
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    var row = { a: 10, b: 3 };
    assertTrue(ev('{{a}} > {{b}}', row, getRow));
    assertFalse(ev('{{b}} > {{a}}', row, getRow));
    assertTrue(ev('{{a}} > 5', row, getRow));
  }

  function testRunIfConditionLegacyFlag() {
    var ev = global.CFS_runIfCondition.evaluate;
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    assertTrue(ev('go', { go: true }, getRow));
    assertFalse(ev('go', { go: false }, getRow));
    assertFalse(ev('go', { go: 0 }, getRow));
    assertTrue(ev('{{enabled}}', { enabled: 1 }, getRow));
  }

  function testRunIfConditionLiteralTrue() {
    var ev = global.CFS_runIfCondition.evaluate;
    function getRow() { return ''; }
    assertTrue(ev('true', {}, getRow));
    assertFalse(ev('false', {}, getRow));
  }

  function testRunIfShouldSkipEmpty() {
    var sk = global.CFS_runIfCondition.shouldSkip;
    function getRow() { return ''; }
    assertFalse(sk('', {}, getRow));
    assertFalse(sk('   ', {}, getRow));
  }

  function testRunIfTripleEqualsAndNotEquals() {
    var ev = global.CFS_runIfCondition.evaluate;
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    var row = { x: 5, y: '5' };
    assertTrue(ev('{{x}} === 5', row, getRow));
    assertTrue(ev('{{y}} == 5', row, getRow));
    assertFalse(ev('{{x}} !== 5', row, getRow));
    assertTrue(ev('{{x}} !== 3', row, getRow));
  }

  function testRunIfSkipWhenRunIfAction() {
    var sw = global.CFS_runIfCondition.skipWhenRunIf;
    function getRow(row, k) { return row != null && row[k] !== undefined ? row[k] : ''; }
    assertFalse(sw({}, { a: 1 }, getRow));
    assertFalse(sw({ runIf: '' }, { a: 1 }, getRow));
    assertFalse(sw({ runIf: '  ' }, { a: 1 }, getRow));
    assertFalse(sw({ runIf: '{{a}}' }, { a: 1 }, getRow));
    assertTrue(sw({ runIf: '{{a}}' }, { a: 0 }, getRow));
  }

  /* =========================================================================
   * step-comment.js — additional edge cases
   * ========================================================================= */

  function testStepCommentPartsWithMedia() {
    var p = global.CFS_stepComment.getStepCommentParts;
    var comment = {
      text: 'Title',
      images: [{ url: 'a.png' }],
      video: { url: 'v.mp4' },
      audio: { url: 'a.mp3' },
      urls: ['https://example.com'],
      mediaOrder: ['text', 'images', 'video', 'audio', 'urls']
    };
    var parts = p(comment);
    assertEqual(parts.length, 5);
    assertEqual(parts[0].type, 'text');
    assertEqual(parts[1].type, 'images');
    assertEqual(parts[2].type, 'video');
    assertEqual(parts[3].type, 'audio');
    assertEqual(parts[4].type, 'urls');
  }

  function testStepCommentPartsCustomOrder() {
    var p = global.CFS_stepComment.getStepCommentParts;
    var comment = { text: 'T', images: [{ url: 'x.png' }], mediaOrder: ['images', 'text'] };
    var parts = p(comment);
    assertEqual(parts[0].type, 'images');
    assertEqual(parts[1].type, 'text');
  }

  function testStepCommentSummaryLongText() {
    var s = global.CFS_stepComment.getStepCommentSummary;
    var long = 'a'.repeat(200);
    var result = s({ text: long }, 50);
    assertEqual(result.length, 51);
    assertTrue(result.endsWith('\u2026'));
  }

  function testStepCommentPartsItemsMode() {
    var p = global.CFS_stepComment.getStepCommentParts;
    var comment = {
      items: [
        { id: '1', type: 'text', text: 'Intro' },
        { id: '2', type: 'link', url: 'https://doc' },
        { id: '3', type: 'image', url: 'pic.png', alt: 'Shot' },
        { id: '4', type: 'video', url: 'https://x/v.webm' },
        { id: '5', type: 'audio', url: 'https://x/a.webm' }
      ],
      images: [{ url: 'legacy.png' }],
      urls: ['https://legacy'],
      mediaOrder: ['items', 'images', 'urls']
    };
    var parts = p(comment);
    assertEqual(parts.length, 5);
    assertEqual(parts[0].type, 'text');
    assertEqual(parts[0].content, 'Intro');
    assertEqual(parts[1].type, 'urls');
    assertEqual(parts[1].content[0], 'https://doc');
    assertEqual(parts[2].type, 'images');
    assertEqual(parts[2].content[0].url, 'pic.png');
    assertEqual(parts[3].type, 'video');
    assertEqual(parts[4].type, 'audio');
  }

  function testStepCommentSummaryJoinsItemTexts() {
    var s = global.CFS_stepComment.getStepCommentSummary;
    var out = s({ items: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }, 10);
    assertTrue(out.indexOf('A') >= 0);
    assertTrue(out.indexOf('B') >= 0);
  }

  /* =========================================================================
   * step-validator.js — additional edge cases
   * ========================================================================= */

  function testStepValidatorMissingLabel() {
    var v = global.CFS_stepValidator.validateStepDefinition;
    var r = v({ id: 'click', defaultAction: { type: 'click' } });
    assertFalse(r.valid);
    assertTrue(r.errors.some(function(e) { return e.indexOf('label') >= 0; }));
  }

  function testStepValidatorMissingDefaultAction() {
    var v = global.CFS_stepValidator.validateStepDefinition;
    var r = v({ id: 'click', label: 'Click' });
    assertFalse(r.valid);
    assertTrue(r.errors.some(function(e) { return e.indexOf('defaultAction') >= 0; }));
  }

  function testStepValidatorNullInput() {
    var v = global.CFS_stepValidator.validateStepDefinition;
    var r = v(null);
    assertFalse(r.valid);
  }

  /* =========================================================================
   * maskPii — PII masking logic
   * ========================================================================= */

  function maskPii(str) {
    if (str == null || typeof str !== 'string') return '';
    var out = str;
    out = out.replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, 'XXXX-XXXX-XXXX-XXXX');
    out = out.replace(/\d{3}[-\s]?\d{2}[-\s]?\d{4}/g, 'XXX-XX-XXXX');
    return out;
  }

  function testMaskPiiCreditCardWithDashes() {
    assertEqual(maskPii('4111-1111-1111-1111'), 'XXXX-XXXX-XXXX-XXXX');
  }

  function testMaskPiiCreditCardWithSpaces() {
    assertEqual(maskPii('4111 1111 1111 1111'), 'XXXX-XXXX-XXXX-XXXX');
  }

  function testMaskPiiCreditCardNoDashes() {
    assertEqual(maskPii('4111111111111111'), 'XXXX-XXXX-XXXX-XXXX');
  }

  function testMaskPiiSsnWithDashes() {
    assertEqual(maskPii('123-45-6789'), 'XXX-XX-XXXX');
  }

  function testMaskPiiSsnNoDashes() {
    assertEqual(maskPii('123456789'), 'XXX-XX-XXXX');
  }

  function testMaskPiiMixedContent() {
    var input = 'Card: 4111-1111-1111-1111, SSN: 123-45-6789';
    var out = maskPii(input);
    assertTrue(out.indexOf('4111') < 0, 'card digits removed');
    assertTrue(out.indexOf('6789') < 0, 'ssn digits removed');
    assertTrue(out.indexOf('XXXX-XXXX-XXXX-XXXX') >= 0, 'card masked');
    assertTrue(out.indexOf('XXX-XX-XXXX') >= 0, 'ssn masked');
  }

  function testMaskPiiPlainText() {
    assertEqual(maskPii('Hello world'), 'Hello world');
  }

  function testMaskPiiNull() {
    assertEqual(maskPii(null), '');
  }

  function testMaskPiiUndefined() {
    assertEqual(maskPii(undefined), '');
  }

  function testMaskPiiAttributeValue() {
    assertEqual(maskPii('4111111111111111'), 'XXXX-XXXX-XXXX-XXXX');
  }

  function testMaskPiiInSurroundingText() {
    var result = maskPii('Pay with 4111-1111-1111-1111 today');
    assertEqual(result, 'Pay with XXXX-XXXX-XXXX-XXXX today');
  }

  /** CFS_runVideoSegments — analyze step clip timeline */
  function testRunVideoSegmentsClipBasic() {
    var c = global.CFS_runVideoSegments && global.CFS_runVideoSegments.clipToTimelineSeconds;
    if (!c) throw new Error('CFS_runVideoSegments not loaded');
    var r = c(11000, 13000, 10000, 10000, 60);
    assertTrue(r.ok, 'ok');
    assertEqual(r.startSec, 1);
    assertEqual(r.durationSec, 2);
  }

  function testRunVideoSegmentsNoClipStart() {
    var c = global.CFS_runVideoSegments.clipToTimelineSeconds;
    var r = c(null, 10000, 10000, 10000, 60);
    assertFalse(r.ok);
  }

  function testRunVideoSegmentsClampToDuration() {
    var c = global.CFS_runVideoSegments.clipToTimelineSeconds;
    var r = c(5000, 50000, 5000, 5000, 10);
    assertTrue(r.ok);
    assertTrue(r.startSec >= 0);
    assertTrue(r.durationSec <= 10);
  }

  /* =========================================================================
   * CFS_tooltipOverlay — tooltip overlay module tests
   * ========================================================================= */

  function testTooltipOverlayExists() {
    assertTrue(global.CFS_tooltipOverlay !== undefined, 'CFS_tooltipOverlay loaded');
    assertTrue(typeof global.CFS_tooltipOverlay.create === 'function', 'create is function');
    assertTrue(typeof global.CFS_tooltipOverlay.renderTooltipContent === 'function', 'renderTooltipContent is function');
    assertTrue(typeof global.CFS_tooltipOverlay.positionHighlight === 'function', 'positionHighlight is function');
  }

  function testTooltipOverlayCreateShape() {
    var instance = global.CFS_tooltipOverlay.create({ container: document.createElement('div') });
    assertTrue(instance.overlay !== undefined, 'has overlay');
    assertTrue(instance.tooltip !== undefined, 'has tooltip');
    assertTrue(instance.highlight !== undefined, 'has highlight');
    assertTrue(instance.bar !== undefined, 'has bar');
    assertTrue(typeof instance.show === 'function', 'has show');
    assertTrue(typeof instance.next === 'function', 'has next');
    assertTrue(typeof instance.prev === 'function', 'has prev');
    assertTrue(typeof instance.destroy === 'function', 'has destroy');
    assertTrue(typeof instance.setSteps === 'function', 'has setSteps');
    assertTrue(typeof instance.getCurrentIndex === 'function', 'has getCurrentIndex');
    instance.destroy();
  }

  function testTooltipOverlayRenderText() {
    var el = document.createElement('div');
    global.CFS_tooltipOverlay.renderTooltipContent({ tooltip: 'Hello step' }, el);
    assertTrue(el.textContent.indexOf('Hello step') >= 0, 'renders tooltip text');
  }

  function testTooltipOverlayRenderCommentParts() {
    var el = document.createElement('div');
    var tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    global.CFS_tooltipOverlay.renderTooltipContent({
      commentParts: [
        { type: 'text', content: 'Do this thing' },
        { type: 'images', content: [{ url: tinyPng, alt: 'img' }] }
      ]
    }, el);
    assertTrue(el.childNodes.length >= 2, 'renders text + image');
    assertEqual(el.childNodes[0].textContent, 'Do this thing');
    assertEqual(el.childNodes[1].tagName.toLowerCase(), 'img');
    assertEqual(el.childNodes[1].getAttribute('alt'), 'img');
  }

  function testTooltipOverlayRenderFallback() {
    var el = document.createElement('div');
    global.CFS_tooltipOverlay.renderTooltipContent({ index: 3 }, el);
    assertTrue(el.textContent.indexOf('Step 3') >= 0, 'fallback shows step index');
  }

  function testTooltipOverlayNavigation() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var stepLog = [];
    var instance = global.CFS_tooltipOverlay.create({
      container: container,
      onStep: function(idx) { stepLog.push(idx); }
    });
    instance.setSteps([
      { index: 1, tooltip: 'Step 1', selectors: [] },
      { index: 2, tooltip: 'Step 2', selectors: [] },
      { index: 3, tooltip: 'Step 3', selectors: [] }
    ]);
    instance.show(0);
    assertEqual(instance.getCurrentIndex(), 0, 'starts at 0');
    instance.next();
    assertEqual(instance.getCurrentIndex(), 1, 'next goes to 1');
    instance.next();
    assertEqual(instance.getCurrentIndex(), 2, 'next goes to 2');
    instance.prev();
    assertEqual(instance.getCurrentIndex(), 1, 'prev goes to 1');
    instance.prev();
    assertEqual(instance.getCurrentIndex(), 0, 'prev goes to 0');
    instance.prev();
    assertEqual(instance.getCurrentIndex(), 0, 'prev at 0 stays at 0');
    assertTrue(stepLog.length >= 4, 'onStep called for each navigation');
    instance.destroy();
    document.body.removeChild(container);
  }

  function testTooltipOverlayComplete() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var completed = false;
    var instance = global.CFS_tooltipOverlay.create({
      container: container,
      onComplete: function() { completed = true; }
    });
    instance.setSteps([
      { index: 1, tooltip: 'Step 1', selectors: [] },
      { index: 2, tooltip: 'Step 2', selectors: [] }
    ]);
    instance.show(0);
    instance.next();
    assertFalse(completed, 'not complete after first next');
    instance.next();
    assertTrue(completed, 'complete after navigating past last step');
    instance.destroy();
    document.body.removeChild(container);
  }

  function testTooltipOverlayDestroy() {
    var container = document.createElement('div');
    document.body.appendChild(container);
    var destroyed = false;
    var instance = global.CFS_tooltipOverlay.create({
      container: container,
      onDestroy: function() { destroyed = true; }
    });
    instance.setSteps([{ index: 1, tooltip: 'Step', selectors: [] }]);
    instance.show(0);
    var childCountBefore = container.childNodes.length;
    assertTrue(childCountBefore >= 3, 'overlay, tooltip, bar added');
    instance.destroy();
    assertTrue(destroyed, 'onDestroy called');
    assertEqual(container.childNodes.length, 0, 'DOM cleaned up');
    document.body.removeChild(container);
  }

  function testTooltipOverlayPositionHighlight() {
    var highlight = document.createElement('div');
    global.CFS_tooltipOverlay.positionHighlight(null, highlight);
    assertEqual(highlight.style.display, 'none', 'hidden when no target');

    var target = document.createElement('div');
    target.style.cssText = 'position:fixed;left:10px;top:20px;width:100px;height:40px;';
    document.body.appendChild(target);
    global.CFS_tooltipOverlay.positionHighlight(target, highlight);
    assertEqual(highlight.style.display, 'block', 'visible when target exists');
    assertTrue(highlight.style.border.indexOf('#4a9eff') >= 0 || highlight.style.border.indexOf('solid') >= 0, 'has blue border');
    document.body.removeChild(target);
  }

  function testTooltipOverlayRenderVideoAudio() {
    var el = document.createElement('div');
    var dataVideo = 'data:video/mp4,';
    var dataAudio = 'data:audio/mpeg,';
    global.CFS_tooltipOverlay.renderTooltipContent({
      commentParts: [
        { type: 'video', content: { url: dataVideo } },
        { type: 'audio', content: { url: dataAudio } }
      ]
    }, el);
    var video = el.querySelector('video');
    var audio = el.querySelector('audio');
    assertTrue(video !== null, 'video element created');
    assertTrue(audio !== null, 'audio element created');
    assertEqual(video.getAttribute('src'), dataVideo);
    assertEqual(audio.getAttribute('src'), dataAudio);
  }

  /* =========================================================================
   * Walkthrough export — config + runner integration with sections
   * ========================================================================= */

  function testWalkthroughConfigForSamplePage() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughConfig;
    var workflow = {
      name: 'Sample Signup Flow',
      id: 'sample-signup',
      analyzed: {
        actions: [
          { type: 'click', comment: { text: 'Click the signup button' }, selectors: ['#signup-btn'] },
          { type: 'type', comment: { text: 'Enter your email address' }, selectors: ['#email-input'] },
          { type: 'click', comment: { text: 'Submit the form' }, selectors: ['#submit-btn'] }
        ]
      }
    };
    var cfg = fn(workflow);
    assertEqual(cfg.name, 'Sample Signup Flow');
    assertEqual(cfg.steps.length, 3);
    assertEqual(cfg.steps[0].tooltip, 'Click the signup button');
    assertEqual(cfg.steps[1].tooltip, 'Enter your email address');
    assertEqual(cfg.steps[2].tooltip, 'Submit the form');
    assertTrue(cfg.steps[0].selectors.length > 0, 'selectors present');
  }

  function testWalkthroughRunnerScriptContainsAPI() {
    var fn = global.CFS_walkthroughExport.buildWalkthroughRunnerScript;
    var config = {
      name: 'Test',
      steps: [{ index: 1, type: 'click', selectors: ['#btn'], tooltip: 'Click' }]
    };
    var script = fn(config);
    assertTrue(script.indexOf('__CFS_walkthrough') >= 0, 'exposes __CFS_walkthrough');
    assertTrue(script.indexOf('start') >= 0, 'has start');
    assertTrue(script.indexOf('next') >= 0, 'has next');
    assertTrue(script.indexOf('prev') >= 0, 'has prev');
    assertTrue(script.indexOf('destroy') >= 0, 'has destroy');
  }

  function testDiscoverySelectorFiltersStablePatterns() {
    var F = global.CFS_discoverySelectorFilters;
    if (!F) throw new Error('CFS_discoverySelectorFilters missing');
    assertTrue(!F.shouldSkipCssStringForDiscoveryCandidates('[data-testid="foo"]'), 'keeps data-testid');
    assertTrue(!F.shouldSkipCssStringForDiscoveryCandidates('#radix-dialog'), 'keeps radix id path');
    assertTrue(!F.shouldSkipCssStringForDiscoveryCandidates('textarea'), 'keeps tag selector');
  }

  function testDiscoverySelectorFiltersUnstableSingleClass() {
    var F = global.CFS_discoverySelectorFilters;
    if (!F) throw new Error('CFS_discoverySelectorFilters missing');
    assertTrue(F.shouldSkipCssStringForDiscoveryCandidates('.css-1a2b3c4d5e'), 'skips long hashed class');
    assertTrue(F.shouldSkipCssStringForDiscoveryCandidates('.emotion-abc123def456'), 'skips emotion-prefixed class');
  }

  function testDiscoverySelectorFiltersEmptyOrHuge() {
    var F = global.CFS_discoverySelectorFilters;
    if (!F) throw new Error('CFS_discoverySelectorFilters missing');
    assertTrue(F.shouldSkipCssStringForDiscoveryCandidates(''), 'skips empty');
    assertTrue(F.shouldSkipCssStringForDiscoveryCandidates('   '), 'skips whitespace');
    assertTrue(F.shouldSkipCssStringForDiscoveryCandidates(new Array(502).join('a')), 'skips oversized');
  }

  /** Discovery from analyzed steps */
  function testDiscoveryFromAnalyzeHostKey() {
    var m = global.CFS_discoveryFromAnalyze;
    if (!m) throw new Error('CFS_discoveryFromAnalyze missing');
    assertEqual(m.discoveryHostKeyFromUrlPattern({ origin: 'https://labs.google/foo' }), 'labs.google');
    assertEqual(m.discoveryHostKeyFromPageUrl('https://flow.google/x'), 'flow.google');
    assertEqual(m.discoveryHostKeyFromUrlPattern(null), null);
  }

  function testDiscoveryFromAnalyzeCssExtract() {
    var m = global.CFS_discoveryFromAnalyze;
    var action = {
      type: 'click',
      selectors: [{ type: 'id', value: '#a' }, { type: 'cssPath', value: 'div.b' }],
      fallbackSelectors: [{ type: 'id', value: '#a' }],
    };
    assertDeepEqual(m.cssStringsFromAction(action), ['#a', 'div.b']);
  }

  /** Recorder emits hover steps; analyze merge should feed their selectors into discovery like click/type. */
  function testDiscoveryFromAnalyzeHoverExtract() {
    var m = global.CFS_discoveryFromAnalyze;
    var action = {
      type: 'hover',
      selectors: [{ type: 'cssPath', value: 'button.menu' }],
      fallbackSelectors: [{ type: 'class', value: '.alt' }],
    };
    assertDeepEqual(m.cssStringsFromAction(action), ['button.menu', '.alt']);
  }

  /** Recorder scroll (delta) and dragDrop contribute container / drag selectors to discovery. */
  function testDiscoveryFromAnalyzeScrollDragExtract() {
    var m = global.CFS_discoveryFromAnalyze;
    var scrollAct = {
      type: 'scroll',
      containerSelectors: [{ type: 'cssPath', value: '.scrollpane' }],
    };
    assertDeepEqual(m.cssStringsFromAction(scrollAct), ['.scrollpane']);
    var dragAct = {
      type: 'dragDrop',
      sourceSelectors: [{ type: 'id', value: '#src' }],
      targetSelectors: [{ type: 'id', value: '#dst' }],
    };
    assertDeepEqual(m.cssStringsFromAction(dragAct), ['#src', '#dst']);
  }

  function testDiscoveryFromAnalyzeNavAndKeyExtract() {
    var m = global.CFS_discoveryFromAnalyze;
    assertDeepEqual(m.cssStringsFromAction({ type: 'key', key: 'Enter' }), []);
    var nav = m.cssStringsFromAction({ type: 'goToUrl', url: 'https://app.example.com/dashboard/settings' });
    assertTrue(nav.indexOf('/dashboard/settings') >= 0, 'pathname from goToUrl');
    var root = m.cssStringsFromAction({ type: 'openTab', url: 'https://ex.com/' });
    assertEqual(root.length, 0, 'root path not added as candidate');
  }

  function testDiscoveryMergeAppendOnly() {
    var m = global.CFS_discoveryFromAnalyze;
    var wf = {
      discovery: {
        domains: {
          'labs.google': {
            inputCandidates: ['textarea'],
            groupSelectors: ['article'],
          },
        },
      },
    };
    var analyzed = {
      urlPattern: { origin: 'https://labs.google', pathPattern: '*' },
      actions: [{ type: 'type', selectors: [{ type: 'cssPath', value: '[data-x="1"]' }] }],
    };
    var copy = JSON.parse(JSON.stringify(wf));
    var r = m.mergeDiscoveryInputCandidatesForHost(copy, analyzed, {});
    assertTrue(r.updated);
    assertEqual(r.added, 1);
    assertDeepEqual(copy.discovery.domains['labs.google'].inputCandidates, ['textarea', '[data-x="1"]']);
    assertEqual(copy.discovery.domains['labs.google'].groupSelectors.length, 1);
  }

  function testDiscoveryMergeUsesFallbackHostWhenNoOrigin() {
    var m = global.CFS_discoveryFromAnalyze;
    var wf = { discovery: { domains: {} } };
    var analyzed = {
      urlPattern: {},
      actions: [{ type: 'click', selectors: [{ type: 'cssPath', value: '.btn' }] }],
    };
    var copy = JSON.parse(JSON.stringify(wf));
    var r = m.mergeDiscoveryInputCandidatesForHost(copy, analyzed, { fallbackHost: 'example.com' });
    assertTrue(r.updated);
    assertEqual(r.host, 'example.com');
    assertDeepEqual(copy.discovery.domains['example.com'].inputCandidates, ['.btn']);
  }

  function testCrossWorkflowMergeFallbacks() {
    var x = global.CFS_crossWorkflowSelectors;
    if (!x) throw new Error('CFS_crossWorkflowSelectors missing');
    var canon = {
      type: 'click',
      selectors: [{ type: 'id', value: '#x', score: 10 }],
      fallbackSelectors: [{ type: 'class', value: '.a', score: 5 }],
    };
    var donor = {
      type: 'click',
      selectors: [{ type: 'id', value: '#x', score: 9 }],
      fallbackSelectors: [{ type: 'cssPath', value: 'button.go', score: 4 }],
    };
    var merged = x.mergeFallbackChainsForSameElement(canon, donor);
    assertTrue((merged.fallbackSelectors || []).length >= 2);
    assertDeepEqual(merged.selectors, canon.selectors);
  }

  function testDiscoveryOutputMergeAppendOnly() {
    var m = global.CFS_discoveryFromAnalyze;
    var wf = {
      discovery: {
        domains: {
          'labs.google': {
            outputCandidates: ['.out1'],
            inputCandidates: ['a'],
          },
        },
      },
    };
    var analyzed = {
      urlPattern: { origin: 'https://labs.google', pathPattern: '*' },
      actions: [{ type: 'click', domShowHide: { show: ['.newOut', '.out1'] } }],
    };
    var copy = JSON.parse(JSON.stringify(wf));
    var r = m.mergeDiscoveryOutputCandidatesForHost(copy, analyzed, {});
    assertTrue(r.updated);
    assertEqual(r.added, 1);
    assertDeepEqual(copy.discovery.domains['labs.google'].outputCandidates, ['.out1', '.newOut']);
    assertEqual(copy.discovery.domains['labs.google'].inputCandidates.length, 1);
  }

  function testShotstackMergePlaceholderFill() {
    var fn = global.__CFS_ensureMergeEntriesForTimelinePlaceholders;
    if (!fn) throw new Error('__CFS_ensureMergeEntriesForTimelinePlaceholders not loaded');
    var t = {
      timeline: { tracks: [{ clips: [{ asset: { type: 'title', text: 'Hi {{ FOO_BAR }} ok' } }] }] },
      merge: []
    };
    fn(t);
    assertEqual(t.merge.length, 1, 'one synthesized row');
    assertEqual(t.merge[0].find, 'FOO_BAR');
    assertEqual(t.merge[0].replace, '');

    var t2 = {
      timeline: { x: '{{ BAZ }}' },
      merge: [{ find: 'BAZ', replace: 'hello' }]
    };
    fn(t2);
    assertEqual(t2.merge.length, 1, 'no duplicate BAZ');

    var t3 = {
      timeline: { nested: '{{  spaced_key  }}' },
      merge: []
    };
    fn(t3);
    assertEqual(t3.merge.length, 1);
    assertEqual(t3.merge[0].find, 'spaced_key');

    var t4 = {
      timeline: {},
      merge: [{ find: 'X', replace: '{{ NESTED }}' }]
    };
    fn(t4);
    assertTrue(t4.merge.some(function (m) { return m.find === 'NESTED'; }), 'placeholder in merge.replace');
  }

  function testEnsureSelectCrossWorkflowMerge() {
    var x = global.CFS_crossWorkflowSelectors;
    if (!x) throw new Error('CFS_crossWorkflowSelectors missing');
    var canon = {
      type: 'ensureSelect',
      checkSelectors: [{ type: 'css', value: '#c', score: 9 }],
      openSelectors: [],
      fallbackSelectors: [{ type: 'css', value: '.x', score: 3 }],
    };
    var donor = {
      type: 'ensureSelect',
      checkSelectors: [{ type: 'css', value: '#d', score: 8 }],
      openSelectors: [{ type: 'css', value: '.o', score: 5 }],
      fallbackSelectors: [{ type: 'css', value: '.f', score: 2 }],
    };
    var merged = x.mergeFallbackChainsForSameElement(canon, donor);
    assertEqual(merged.type, 'ensureSelect');
    var vals = (merged.fallbackSelectors || []).map(function (s) { return s && s.value; }).join(' ');
    assertTrue(vals.indexOf('#d') >= 0 && vals.indexOf('.o') >= 0 && vals.indexOf('.f') >= 0);
  }

  function testSelectorParityReportAndNthRefine() {
    var P = global.CFS_selectorParity;
    if (!P) throw new Error('CFS_selectorParity missing');
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<button class="dup" id="cfs-parity-a"></button><button class="dup" id="cfs-parity-mid"></button><button class="dup" id="cfs-parity-c"></button>';
    document.body.appendChild(wrap);
    try {
      var action = {
        type: 'click',
        selectors: [{ type: 'id', value: '#cfs-parity-mid', score: 10 }],
        fallbackSelectors: [{ type: 'class', value: 'button.dup', score: 5 }],
      };
      var rep = P.parityReportForAction(action, document);
      assertTrue(rep.canonicalSet && rep.canonicalSet.length === 1);
      assertTrue(rep.entries && rep.entries.length === 2);
      var refined = P.refineActionWithParityRefinements(action, document);
      assertTrue(refined.report && refined.report.ok, 'parity should pass after nth refine');
      assertTrue(refined.added >= 1);
    } finally {
      document.body.removeChild(wrap);
    }
  }

  function testParityRecordedCardinalityMismatch() {
    var P = global.CFS_selectorParity;
    if (!P) throw new Error('CFS_selectorParity missing');
    var wrap = document.createElement('div');
    wrap.innerHTML = '<button type="button" id="cfs-card-one"></button>';
    document.body.appendChild(wrap);
    try {
      var action = {
        type: 'click',
        selectors: [{ type: 'id', value: '#cfs-card-one', score: 10 }],
        _variation: { expectedMatch: { cardinality: 2, cardinalityAgrees: true, source: 'recordedDom' } },
      };
      var rep = P.parityReportForAction(action, document);
      assertTrue(rep.recordedExpectation && rep.recordedExpectation.agrees === false);
      assertEqual(rep.reason, 'cardinality_mismatch_recorded');
      assertTrue(rep.ok === false);
    } finally {
      document.body.removeChild(wrap);
    }
  }

  /** CFS_recordingValue — shared/recording-value.js */
  function testRecordingValueInput() {
    var g = global.CFS_recordingValue && global.CFS_recordingValue.getRecordedTypingValue;
    if (!g) throw new Error('CFS_recordingValue.getRecordedTypingValue not loaded');
    var el = document.createElement('input');
    el.type = 'text';
    el.value = 'ab';
    assertEqual(g(el), 'ab');
  }

  function testRecordingValueTextarea() {
    var g = global.CFS_recordingValue.getRecordedTypingValue;
    var el = document.createElement('textarea');
    el.value = 'line1\nline2';
    assertEqual(g(el), 'line1\nline2');
  }

  function testRecordingValueContentEditable() {
    var g = global.CFS_recordingValue.getRecordedTypingValue;
    var div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.textContent = '';
    div.appendChild(document.createTextNode('ce text'));
    assertEqual(g(div), 'ce text');
  }

  function testRecordingValueNullAndNonElement() {
    var g = global.CFS_recordingValue.getRecordedTypingValue;
    assertEqual(g(null), '');
    assertEqual(g(undefined), '');
    assertEqual(g({}), '');
  }

  function testRecordingValueContentEditableCrLf() {
    var g = global.CFS_recordingValue.getRecordedTypingValue;
    var div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    div.innerHTML = 'a<br>b';
    var v = g(div);
    assertTrue(v.indexOf('a') >= 0 && v.indexOf('b') >= 0);
    var div2 = document.createElement('div');
    div2.setAttribute('contenteditable', 'true');
    div2.textContent = 'x\r\ny';
    assertEqual(g(div2).indexOf('\r'), -1);
    assertTrue(g(div2).indexOf('\n') >= 0);
  }

  /** Following sync core */
  function testFollowingSyncNormalizeApiRow() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var r = c.normalizeFollowingApiRow({ id: '1', following_accounts: [{ handle: 'x', platform_id: 'p' }] });
    assertEqual(r.accounts.length, 1);
    assertEqual(r.accounts[0].handle, 'x');
    var r2 = c.normalizeFollowingApiRow({ id: '2', accounts: [{ handle: 'y' }] });
    assertEqual(r2.accounts.length, 1);
    assertEqual(r2.accounts[0].handle, 'y');
  }

  function testFollowingSyncIsLocalId() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    assertTrue(c.isLocalFollowingId('fp_abc'));
    assertTrue(c.isLocalFollowingId('blake'), 'slug / legacy filename id is local-only → POST');
    assertFalse(c.isLocalFollowingId('550e8400-e29b-41d4-a716-446655440000'));
    assertFalse(c.isLocalFollowingId('0951ad58-d758-4e6e-9f50-399a1b565538'));
    assertFalse(c.isLocalFollowingId(''));
  }

  function testFollowingSyncNormalizeWallet() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var w = c.normalizeFollowingWallet({
      id: 'w1',
      profile: 'p1',
      chain: 'solana',
      address: 'AbCdEf',
      network: 'mainnet-beta',
      sizeMode: 'proportional',
      slippageBps: 75,
    });
    assertEqual(w.chain, 'solana');
    assertEqual(w.sizeMode, 'proportional');
    assertEqual(w.slippageBps, 75);
  }

  function testFollowingSyncPayloadSkipsUnknownPlatform() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var platforms = { twitter: { id: 'plat-1', slug: 'twitter', name: 'Twitter' } };
    var caches = {
      profiles: [{ id: 'p1', name: 'N', user: '', birthday: '', deleted: false }],
      accounts: [{ id: 'a1', handle: 'h', platform: 'nosuch', url: 'u', profile: 'p1', deleted: false }],
      phones: [],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var out = c.buildFollowingPayloadForProfile('p1', caches, platforms);
    assertEqual(out.payload.accounts.length, 0);
    assertTrue(out.skippedAccounts.length >= 1);
  }

  function testFollowingSyncMergeNeedingUpload() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var local = {
      profiles: [{ id: 'fp_1', name: 'L', user: '', birthday: '', deleted: false }],
      accounts: [],
      phones: [],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var online = { profiles: [], accounts: [], phones: [], emails: [], addresses: [], notes: [], wallets: [] };
    var m = c.mergeLocalAndOnlineFollowing(local, online);
    assertTrue(m.profilesNeedingUpload.indexOf('fp_1') >= 0);
  }

  function testFollowingSyncParseUpdatedAtMs() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    assertEqual(c.parseUpdatedAtMs(null), null);
    assertEqual(c.parseUpdatedAtMs(''), null);
    assertEqual(c.parseUpdatedAtMs('   '), null);
    assertEqual(c.parseUpdatedAtMs('not-a-date'), null);
    var iso = '2020-06-15T12:30:00.000Z';
    assertEqual(c.parseUpdatedAtMs(iso), Date.parse(iso));
  }

  function testFollowingSyncMergeServerNewerDropsLocalOnlyChild() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var statusMsg = null;
    var local = {
      profiles: [{ id: 'p1', name: 'Same', user: '', birthday: '', deleted: false, local_edited_at: 1000 }],
      accounts: [],
      phones: [{ id: 'lph1', phone: '+1999', following: 'p1', added_by: '', deleted: false }],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var online = {
      profiles: [{
        id: 'p1',
        name: 'Same',
        user: '',
        birthday: '',
        deleted: false,
        server_updated_at: new Date(5000).toISOString(),
      }],
      accounts: [],
      phones: [{ id: 'sph1', phone: '+1111', following: 'p1', added_by: '', deleted: false }],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var m = c.mergeLocalAndOnlineFollowing(local, online, {
      onFollowingStatus: function (msg) { statusMsg = msg; },
    });
    var phones = m.merged.phones.filter(function (r) { return (r.following || '').trim() === 'p1'; });
    assertEqual(phones.length, 1);
    assertEqual(phones[0].phone, '+1111');
    var prof = m.merged.profiles.filter(function (p) { return (p.id || '').trim() === 'p1'; })[0];
    assertTrue(prof != null);
    assertEqual(prof.local_edited_at, undefined);
    assertTrue(statusMsg != null && statusMsg.indexOf('newer server') >= 0);
  }

  function testFollowingSyncMergeLocalNewerUnionChildren() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var local = {
      profiles: [{ id: 'p1', name: 'LocalName', user: '', birthday: '', deleted: false, local_edited_at: 999999999999 }],
      accounts: [],
      phones: [{ id: 'lph1', phone: '+1999', following: 'p1', added_by: '', deleted: false }],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var online = {
      profiles: [{
        id: 'p1',
        name: 'SrvName',
        user: '',
        birthday: '',
        deleted: false,
        server_updated_at: new Date(1000).toISOString(),
      }],
      accounts: [],
      phones: [{ id: 'sph1', phone: '+1111', following: 'p1', added_by: '', deleted: false }],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var m = c.mergeLocalAndOnlineFollowing(local, online, {});
    var phones = m.merged.phones.filter(function (r) { return (r.following || '').trim() === 'p1'; });
    assertEqual(phones.length, 2);
    var prof = m.merged.profiles.filter(function (p) { return (p.id || '').trim() === 'p1'; })[0];
    assertEqual(prof.name, 'LocalName');
    assertEqual(prof.local_edited_at, 999999999999);
  }

  function testFollowingSyncMergeOrphanUuidInUploadList() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var orphanUuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    var local = {
      profiles: [{ id: orphanUuid, name: 'FromOtherAccount', user: '', birthday: '', deleted: false }],
      accounts: [],
      phones: [],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var online = { profiles: [], accounts: [], phones: [], emails: [], addresses: [], notes: [], wallets: [] };
    var m = c.mergeLocalAndOnlineFollowing(local, online, {});
    assertTrue(m.profilesNeedingUpload.indexOf(orphanUuid) >= 0, 'UUID not in current GET must POST on this account');
  }

  function testFollowingSyncMergeMissingServerTsBaselineUnion() {
    var c = global.FollowingSyncCore;
    if (!c) throw new Error('FollowingSyncCore missing');
    var local = {
      profiles: [{ id: 'p1', name: 'LocalOnlyName', user: '', birthday: '', deleted: false, local_edited_at: 8888888888888 }],
      accounts: [],
      phones: [{ id: 'lph1', phone: '+1999', following: 'p1', added_by: '', deleted: false }],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var online = {
      profiles: [{ id: 'p1', name: 'ServerName', user: '', birthday: '', deleted: false, server_updated_at: '' }],
      accounts: [],
      phones: [{ id: 'sph1', phone: '+1111', following: 'p1', added_by: '', deleted: false }],
      emails: [],
      addresses: [],
      notes: [],
      wallets: [],
    };
    var statusMsg = null;
    var m = c.mergeLocalAndOnlineFollowing(local, online, {
      onFollowingStatus: function (msg) { statusMsg = msg; },
    });
    var phones = m.merged.phones.filter(function (r) { return (r.following || '').trim() === 'p1'; });
    assertEqual(phones.length, 2);
    var prof = m.merged.profiles.filter(function (p) { return (p.id || '').trim() === 'p1'; })[0];
    assertEqual(prof.name, 'ServerName');
    assertEqual(prof.local_edited_at, 8888888888888);
    assertEqual(statusMsg, null);
  }

  function testSelectorParityMultiListNthRefine() {
    var P = global.CFS_selectorParity;
    if (!P) throw new Error('CFS_selectorParity missing');
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<ul id="cfs-mul-par-ul">' +
      '<li class="it" data-cfs-mul="y"></li><li class="it" data-cfs-mul="y"></li><li class="it" data-cfs-mul="y"></li>' +
      '<li class="it"></li></ul>';
    document.body.appendChild(wrap);
    try {
      var action = {
        type: 'click',
        selectors: [{ type: 'attr', value: '[data-cfs-mul="y"]', score: 10 }],
        fallbackSelectors: [{ type: 'class', value: 'li.it', score: 5 }],
      };
      var rep = P.parityReportForAction(action, document);
      assertTrue(rep.canonicalSet && rep.canonicalSet.length === 3, 'canonical set should be 3 nodes');
      assertTrue(rep.entries && rep.entries.length === 2);
      assertTrue(rep.entries[1].overshoot, 'broad li.it should overshoot');
      var refined = P.refineActionWithParityRefinements(action, document);
      assertTrue(refined.report && refined.report.ok, 'multi parity should pass after comma nth refine');
      assertTrue(refined.added >= 1);
    } finally {
      document.body.removeChild(wrap);
    }
  }

  function testConnectedAccountLimitCanAddUnderCap() {
    var E = global.ExtensionApi;
    if (!E || typeof E.canAddConnectedProfile !== 'function') {
      throw new Error('ExtensionApi.canAddConnectedProfile not loaded');
    }
    assertTrue(E.canAddConnectedProfile(0, 3));
    assertTrue(E.canAddConnectedProfile(2, 3));
    assertFalse(E.canAddConnectedProfile(3, 3));
    assertFalse(E.canAddConnectedProfile(4, 3));
    assertFalse(E.canAddConnectedProfile(0, 0));
    assertFalse(E.canAddConnectedProfile(0, -1));
    assertFalse(E.canAddConnectedProfile(0, NaN));
  }

  function testConnectedAccountLimitAppend() {
    var E = global.ExtensionApi;
    if (!E || typeof E.appendConnectedProfileIfUnderCap !== 'function') {
      throw new Error('ExtensionApi.appendConnectedProfileIfUnderCap not loaded');
    }
    var np = { id: 'n' };
    var r0 = E.appendConnectedProfileIfUnderCap([], np, 1);
    assertTrue(r0.added);
    assertEqual(r0.profiles.length, 1);
    var r1 = E.appendConnectedProfileIfUnderCap([{ id: 1 }], np, 1);
    assertFalse(r1.added);
    assertEqual(r1.profiles.length, 1);
    var r2 = E.appendConnectedProfileIfUnderCap([{ id: 1 }], np, 2);
    assertTrue(r2.added);
    assertEqual(r2.profiles.length, 2);
  }

  function testConnectedAccountLimitAddSocialGate() {
    var E = global.ExtensionApi;
    if (!E || typeof E.addSocialProfileIfAllowed !== 'function') {
      throw new Error('ExtensionApi.addSocialProfileIfAllowed not loaded');
    }
    var ok = E.addSocialProfileIfAllowed(0, 2, { name: 'a', user: 'u' });
    assertTrue(ok.ok);
    assertEqual(ok.body.name, 'a');
    var bad = E.addSocialProfileIfAllowed(2, 2, { name: 'a', user: 'u' });
    assertFalse(bad.ok);
    assertEqual(bad.status, 403);
  }

  function testConnectedAccountLimitBackendAliasMatches() {
    var E = global.ExtensionApi;
    if (!E || typeof E.canAddBackendConnectedProfile !== 'function') {
      throw new Error('ExtensionApi.canAddBackendConnectedProfile not loaded');
    }
    assertTrue(E.canAddBackendConnectedProfile(0, 2) === E.canAddConnectedProfile(0, 2));
    assertTrue(E.canAddBackendConnectedProfile(2, 2) === E.canAddConnectedProfile(2, 2));
  }

  function testConnectedAccountLimitOverflowAppend() {
    var E = global.ExtensionApi;
    if (!E || typeof E.appendConnectedProfileOverflow !== 'function') {
      throw new Error('ExtensionApi.appendConnectedProfileOverflow not loaded');
    }
    var p1 = { _username: 'foo', name: 'Foo' };
    var r0 = E.appendConnectedProfileOverflow([], p1);
    assertTrue(r0.added);
    assertEqual(r0.profiles.length, 1);
    var r1 = E.appendConnectedProfileOverflow(r0.profiles, { _username: 'foo', name: 'Foo2' });
    assertFalse(r1.added);
    assertEqual(r1.profiles.length, 1);
    var r2 = E.appendConnectedProfileOverflow(r0.profiles, { _username: 'bar', name: 'Bar' });
    assertTrue(r2.added);
    assertEqual(r2.profiles.length, 2);
  }

  function testPersonalInfoSyncPublishedRedactsPhrase() {
    var S = global.CFS_personalInfoSync;
    if (!S || typeof S.cloneWorkflowForPublishedSync !== 'function') throw new Error('CFS_personalInfoSync not loaded');
    var wf = {
      published: true,
      name: 't',
      personalInfo: [
        { text: 'secret', replacementWord: '***' },
        {
          selectors: [{ type: 'id', value: '#x' }],
          mode: 'replaceWholeElement',
          replacementWord: '—',
        },
      ],
    };
    var c = S.cloneWorkflowForPublishedSync(wf);
    assertEqual(c.personalInfo.length, 1);
    assertEqual(c.personalInfo[0].mode, 'replaceWholeElement');
    assertTrue(!c.personalInfo[0].text);
  }

  function testPersonalInfoSyncUnpublishedKeepsPhrase() {
    var S = global.CFS_personalInfoSync;
    var wf = { published: false, personalInfo: [{ text: 'keep', replacementWord: '*' }] };
    var c = S.cloneWorkflowForPublishedSync(wf);
    assertEqual(c.personalInfo.length, 1);
    assertEqual(c.personalInfo[0].text, 'keep');
  }

  function testPersonalInfoSyncMergeFromFetch() {
    var S = global.CFS_personalInfoSync;
    var remote = [
      { selectors: [{ type: 'id', value: '#a' }], mode: 'replaceWholeElement', replacementWord: 'x' },
    ];
    var prev = [
      { selectors: [{ type: 'id', value: '#a' }], mode: 'replaceWholeElement', replacementWord: 'x', text: 'mysecret' },
    ];
    var m = S.mergePersonalInfoFromFetch(remote, prev);
    assertEqual(m.length, 1);
    assertEqual(m[0].text, 'mysecret');
  }

  function testPersonalInfoApplyToTypedValuePhraseAndRegex() {
    var S = global.CFS_personalInfoSync;
    if (!S.applyToTypedValue) throw new Error('applyToTypedValue missing');
    var el = {};
    function resolveElement(sels, doc) {
      return el;
    }
    assertEqual(S.applyToTypedValue('John Doe', el, [{ text: 'John Doe', replacementWord: '[n]' }], resolveElement, {}), '[n]');
    var pi = [
      {
        selectors: [{ type: 'id', value: '#f' }],
        mode: 'replaceRegexInElement',
        regex: '\\d{3}',
        replacementWord: 'N',
      },
    ];
    assertEqual(S.applyToTypedValue('foo123bar', el, pi, resolveElement, {}), 'fooNbar');
    assertEqual(S.applyToTypedValue('foo123bar', null, pi, resolveElement, {}), 'foo123bar');
  }

  /** Infinity multi-hop path JSON shape (shared/infi-bin-path-json-shape.js) */
  function testInfiBinPathJsonShapeValidOneHop() {
    var p = global.CFS_parseInfiBinPathJsonShape;
    if (typeof p !== 'function') throw new Error('CFS_parseInfiBinPathJsonShape not loaded');
    var j = JSON.stringify([
      {
        intermediateCurrency: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        infinityFee: '3000',
        binStep: '10',
      },
    ]);
    var r = p(j);
    assertTrue(r.ok, 'one hop ok');
    assertEqual(r.hops.length, 1);
  }

  function testInfiBinPathJsonShapeRejectsFeeOverflow() {
    var p = global.CFS_parseInfiBinPathJsonShape;
    var j = JSON.stringify([
      {
        intermediateCurrency: '0x0000000000000000000000000000000000000001',
        infinityFee: '16777216',
        binStep: '1',
      },
    ]);
    var r = p(j);
    assertFalse(r.ok);
    assertTrue(r.error.indexOf('uint24') >= 0);
  }

  function testInfiBinPathCurrencyChainErrorDetectsStall() {
    var c = global.CFS_infiBinPathCurrencyChainError;
    if (typeof c !== 'function') throw new Error('CFS_infiBinPathCurrencyChainError not loaded');
    var hops = [{ intermediateCurrency: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' }];
    var e = c('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', hops);
    assertTrue(e != null && e.indexOf('must differ') >= 0);
  }

  global.CFS_unitTestsRegistered = [
    testConnectedAccountLimitCanAddUnderCap,
    testConnectedAccountLimitAppend,
    testConnectedAccountLimitAddSocialGate,
    testConnectedAccountLimitBackendAliasMatches,
    testConnectedAccountLimitOverflowAppend,
    testStepValidatorValid,
    testStepValidatorMissingId,
    testStepValidatorIdMismatch,
    testStepValidatorDefaultActionMismatch,
    testStepCommentSummary,
    testStepCommentParts,
    testPersonalInfoSyncPublishedRedactsPhrase,
    testPersonalInfoSyncUnpublishedKeepsPhrase,
    testPersonalInfoSyncMergeFromFetch,
    testPersonalInfoApplyToTypedValuePhraseAndRegex,
    testBookBuilderGetStepCaption,
    testBookBuilderGetStepBody,
    testWalkthroughSelectorStrings,
    testWalkthroughBuildConfig,
    testAnalyzerNormalStepType,
    testAnalyzerUrlToCaptureContext,
    testAnalyzerMergeSelectors,
    testAnalyzerMergeFallbackTexts,
    testSelectorsDecodeSelectorValue,
    testSelectorsScoreSelectorString,
    testTemplateResolverBasic,
    testTemplateResolverStepComment,
    testTemplateResolverStepCommentSummaryTruncation,
    testTemplateResolverGetByPath,
    testTemplateResolverMissingVar,
    testTemplateResolverNullInput,
    testSendToEndpointFallbackResolveTemplate,
    testShouldRunRecurringMonthlyWithoutDay,
    testShouldRunRecurringYearlyWithoutMonthDay,
    testVideoCombinerEndTimeCondition,
    testGetNowInTimezoneShape,
    testShouldRunRecurringWeeklyArray,
    testShouldRunRecurringIntervalFirstRun,
    testShouldRunRecurringAlreadyRan,
    testShouldRunRecurringUnknownPattern,
    testResolveNestedWorkflows,
    testNormalizeProjectStepHandlers,
    testMkHistoryEntry,
    testValidateMessagePayload,
    testInfiBinPathJsonShapeValidOneHop,
    testInfiBinPathJsonShapeRejectsFeeOverflow,
    testInfiBinPathCurrencyChainErrorDetectsStall,
    testOffscreenMutexFIFOOrder,
    testOffscreenMutexErrorRelease,
    testOffscreenMutexSingleConcurrent,
    testSelectorEntryKey,
    testNormalizeSelectorEntry,
    testActionSimilarityBasic,
    testActionSimilarityMatchingSelectors,
    testActionSimilarityPartialSelectors,
    testActionSimilarityTypeInputs,
    testActionSimilaritySelectInputs,
    testActionSimilarityClickText,
    testActionSelectorsToCssStringsExtended,
    testScoreSelectorStringEdgeCases,
    testGenerateSelectorsNull,
    testGenerateSelectorsWithId,
    testGenerateSelectorsSkipsDynamicIds,
    testGenerateSelectorsDataTestAttrs,
    testGenerateSelectorsCustomDataAttrs,
    testGenerateSelectorsAriaLabel,
    testTryResolveAllWithSelectorAttrContainsAriaLabel,
    testGenerateSelectorsRole,
    testGenerateSelectorsInputNameAndPlaceholder,
    testGenerateSelectorsInputType,
    testGenerateSelectorsStableClasses,
    testGenerateSelectorsFiltersFrameworkClasses,
    testGenerateSelectorsButtonText,
    testGenerateSelectorsXpathAndCssPath,
    testGenerateSelectorsAncestorDescendant,
    testGenerateSelectorsTitleAttr,
    testGenerateSelectorsHref,
    testGenerateSelectorsXpathText,
    testGenerateSelectorsComprehensiveElement,
    testGenerateSelectorsSelectElement,
    testGenerateSelectorsTextareaElement,
    testGenerateSelectorsLongTextSkipped,
    testGenerateSelectorsStyledComponentClass,
    testFindElementByCssStringsNull,
    testFindElementByCssStringsById,
    testFindElementByCssStringsByClass,
    testFindElementByCssStringsFallthrough,
    testFindElementByCssStringsNoMatch,
    testFindElementByCssStringsInvalidSelector,
    testFindElementByCssStringsFirstWins,
    testFindElementByCssStringsAttrSelector,
    testGeneratePrimaryAndFallbackSelectorsEmpty,
    testGeneratePrimaryAndFallbackSelectorsSplit,
    testGeneratePrimaryAndFallbackSelectorsCustomCount,
    testGenerateSelectorsRoundtripResolve,
    testGetRunIndexForAction,
    testMergeConsecutiveWaits,
    testMergeConsecutiveWaitsGrouping,
    testMergeConsecutiveWaitsIncludesNextFallbackSelectors,
    testMergeActionsNull,
    testMergeActionsSingle,
    testMergeActionsMultipleClicks,
    testMergeActionsType,
    testMergeActionsHover,
    testMergeActionsWait,
    testMergeActionsUpload,
    testMergeActionsSelect,
    testMergeActionsDownload,
    testMergeActionsGoToUrlOpenTabKey,
    testMergeActionsScrollDragDrop,
    testMergeActionsClickSubmitIntent,
    testMergeActionsClickKeyboardActivation,
    testMergeActionsEnsureSelect,
    testDeduplicateByField,
    testDeduplicateByFieldNoKey,
    testDeduplicateByFieldUploadNotMerged,
    testInferVariableKey,
    testInferWaitAfter,
    testInferUrlPattern,
    testInferUrlPatternNoActions,
    testMergeVariationBothNull,
    testMergeVariationOneNull,
    testMergeVariationTwoValid,
    testMergePageState,
    testMergePageStateNoCounts,
    testNormalizeState,
    testStatesOverlap,
    testDetectLoopableWorkflowNull,
    testDetectLoopableWorkflowUrlSame,
    testDetectLoopableWorkflowUrlDifferent,
    testDetectConditionalDropdownsNull,
    testDetectConditionalDropdownsNoDropdown,
    testDetectConditionalDropdownsWithDropdown,
    testReorderSelectorsByStability,
    testReorderSelectorsByStabilityEmpty,
    testApplyExpectedBeforeAfter,
    testComputeSelectorStabilityFromActionsWithRuns,
    testComputeVariationForColumn,
    testComputeVariationForColumnOptional,
    testMergeFallbackTextsExtended,
    testMergeSingleRun,
    testMergeSingleRunAugmentsFallbacksFromMeta,
    testAnalyzeRunsEmpty,
    testAnalyzeRunsSingleRun,
    testAnalyzeRunsMultiRun,
    testAlignRunsBySimilarity,
    testFindBestInsertPosition,
    testApplyVariationToActions,
    testBookBuilderTrimPresets,
    testBookBuilderGetOptionsDefault,
    testBookBuilderGetOptionsCustom,
    testBookBuilderGetOptionsPreset,
    testBookBuilderGetOptionsClamping,
    testBookBuilderBuildMarkdown,
    testBookBuilderBuildMarkdownNoComment,
    testBookBuilderBuildHtml,
    testBookBuilderBuildHtmlEscaping,
    testBookBuilderBuildHtmlForDoc,
    testBookBuilderBuildHtmlPositions,
    testBookBuilderBuildHtmlHeaderFooter,
    testBookBuilderGenerateBookExportMarkdown,
    testBookBuilderGenerateBookExportHtml,
    testBookBuilderGenerateBookExportPdf,
    testBookBuilderGenerateBookExportDoc,
    testBookBuilderGenerateBookExportStepText,
    testBookBuilderGenerateBookExportEmpty,
    testBookBuilderGenerateBookExportNoActions,
    testBookBuilderGenerateBookExportInvalidJson,
    testWalkthroughBuildRunnerScript,
    testWalkthroughBuildRunnerScriptWithConfig,
    testWalkthroughBuildRunnerScriptCustomVar,
    testWalkthroughBuildConfigWithCommentParts,
    testWalkthroughBuildConfigWithQuiz,
    testWalkthroughBuildConfigNoActions,
    testWalkthroughBuildConfigFallbackTooltip,
    testRunVariationSelectorStabilityBasic,
    testRunVariationSelectorStabilityWithData,
    testRunVariationAnalyzeNull,
    testRunVariationAnalyzeBasic,
    testRunVariationAnalyzeOptionalStep,
    testWorkflowSetupConstantsStructure,
    testWorkflowSetupConstantsPlatforms,
    testWorkflowSetupConstantsUpgradePlans,
    testWorkflowSetupConstantsCategories,
    testWorkflowSetupConstantsStorageKey,
    testWorkflowSetupConstantsUpgradePlatforms,
    testTemplateResolverMultipleVars,
    testTemplateResolverNestedPathVar,
    testTemplateResolverNoTemplates,
    testGetByPathDeep,
    testGetByLoosePathNested,
    testRunIfConditionComparisonGt,
    testRunIfConditionLegacyFlag,
    testRunIfConditionLiteralTrue,
    testRunIfShouldSkipEmpty,
    testRunIfTripleEqualsAndNotEquals,
    testRunIfSkipWhenRunIfAction,
    testStepCommentPartsWithMedia,
    testStepCommentPartsCustomOrder,
    testStepCommentSummaryLongText,
    testStepCommentPartsItemsMode,
    testStepCommentSummaryJoinsItemTexts,
    testStepValidatorMissingLabel,
    testStepValidatorMissingDefaultAction,
    testStepValidatorNullInput,
    testMaskPiiCreditCardWithDashes,
    testMaskPiiCreditCardWithSpaces,
    testMaskPiiCreditCardNoDashes,
    testMaskPiiSsnWithDashes,
    testMaskPiiSsnNoDashes,
    testMaskPiiMixedContent,
    testMaskPiiPlainText,
    testMaskPiiNull,
    testMaskPiiUndefined,
    testMaskPiiAttributeValue,
    testMaskPiiInSurroundingText,
    testRunVideoSegmentsClipBasic,
    testRunVideoSegmentsNoClipStart,
    testRunVideoSegmentsClampToDuration,
    testTooltipOverlayExists,
    testTooltipOverlayCreateShape,
    testTooltipOverlayRenderText,
    testTooltipOverlayRenderCommentParts,
    testTooltipOverlayRenderFallback,
    testTooltipOverlayNavigation,
    testTooltipOverlayComplete,
    testTooltipOverlayDestroy,
    testTooltipOverlayPositionHighlight,
    testTooltipOverlayRenderVideoAudio,
    testWalkthroughConfigForSamplePage,
    testWalkthroughRunnerScriptContainsAPI,
    testDiscoverySelectorFiltersStablePatterns,
    testDiscoverySelectorFiltersUnstableSingleClass,
    testDiscoverySelectorFiltersEmptyOrHuge,
    testDiscoveryFromAnalyzeHostKey,
    testDiscoveryFromAnalyzeCssExtract,
    testDiscoveryFromAnalyzeHoverExtract,
    testDiscoveryFromAnalyzeScrollDragExtract,
    testDiscoveryFromAnalyzeNavAndKeyExtract,
    testDiscoveryMergeAppendOnly,
    testDiscoveryMergeUsesFallbackHostWhenNoOrigin,
    testDiscoveryOutputMergeAppendOnly,
    testCrossWorkflowMergeFallbacks,
    testEnsureSelectCrossWorkflowMerge,
    testShotstackMergePlaceholderFill,
    testSelectorParityReportAndNthRefine,
    testSelectorParityMultiListNthRefine,
    testParityRecordedCardinalityMismatch,
    testRecordingValueInput,
    testRecordingValueTextarea,
    testRecordingValueContentEditable,
    testRecordingValueNullAndNonElement,
    testRecordingValueContentEditableCrLf,
    testFollowingSyncNormalizeApiRow,
    testFollowingSyncIsLocalId,
    testFollowingSyncNormalizeWallet,
    testFollowingSyncPayloadSkipsUnknownPlatform,
    testFollowingSyncMergeNeedingUpload,
    testFollowingSyncParseUpdatedAtMs,
    testFollowingSyncMergeServerNewerDropsLocalOnlyChild,
    testFollowingSyncMergeLocalNewerUnionChildren,
    testFollowingSyncMergeOrphanUuidInUploadList,
    testFollowingSyncMergeMissingServerTsBaselineUnion,

    // ── Player pure-function tests ────────────────────────────────────
    testPlayerFormatErr,
    testPlayerFormatErrString,
    testPlayerQcLastItemHasFailedNoItem,
    testPlayerQcLastItemHasFailedWithVideo,
    testPlayerQcLastItemHasFailedMatch,
    testPlayerQcLastItemHasFailedNoMatch,
    testPlayerApplyRowMappingEmpty,
    testPlayerApplyRowMappingWithMapping,
    testPlayerGetRowValueBasic,
    testPlayerGetRowValueCaseInsensitive,
    testPlayerGetRowValueMissing,
    testPlayerLooksLikeUploadTrigger,

    // ── Service worker helper tests ───────────────────────────────────
    testApifyParseRetryAfterMsSeconds,
    testApifyParseRetryAfterMsMax,
    testApifyParseRetryAfterMsEmpty,
    testApifyFormatErrorDetailsString,
    testApifyFormatErrorDetailsTruncation,
    testApifyFormatErrorDetailsObject,
    testApifyFormatErrorDetailsNull,
    testCfsSanitizeLlmChatMessages,
    testCfsValidateRemoteChatInputEmpty,
    testCfsValidateRemoteChatInputTooMany,
    testCfsValidateRemoteChatInputValid,
    testCfsValidateProjectRelativePath,

    // ── PersonalInfo sync tests ───────────────────────────────────────
    testPersonalInfoNormalizeMode,
    testPersonalInfoHasSelectors,
    testPersonalInfoSecretText,
    testPersonalInfoIsPublishableWithoutSecret,
    testPersonalInfoSanitizeForSync,
    testPersonalInfoCloneWorkflowRedactsWhenPublished,
    testPersonalInfoApplyToTypedValue,

    // ── Nested workflow loop tests ────────────────────────────────────
    testResolveNestedWorkflowsWithLoopSteps,

    // ── Player DOM-based tests ────────────────────────────────────────
    testPlayerRunExtractDataBasic,
    testPlayerRunExtractDataNoListContainer,
    testPlayerRunExtractDataMaxItems,
    testPlayerLastItemVideosRendered,
    testPlayerLastItemStillGenerating,

    // ── Auto-discovery pure function tests ────────────────────────────
    testDiscoveryIsHintObject,
    testDiscoverySplitLegacyHints,
    testDiscoveryConcatUniqueArrays,
    testDiscoveryMergeWorkflowHintsOrdered,
    testDiscoveryNormalizeInput,
    testDiscoveryIsUnstableClassSelector,

    // ── GitHub extension update tests ─────────────────────────────────
    testGitHubShouldSkipPath,
    testGitHubFormatSyncStateSummary,

    // ── Sidepanel pure function tests ─────────────────────────────────
    testSidepanelFormatTimeAgo,
    testSidepanelIsRestrictedUrl,
    testSidepanelUrlMatchesPattern,
    testSidepanelIsTestWorkflow,
    testSidepanelNormalizeScriptingError,
    testSidepanelNormalizePlaybackError,
    testSidepanelWorkflowContainsStepType,
    testSidepanelGetDelayBeforeNextRunMs,
    testSidepanelWorkflowNeedsVideoBatchWait,
    testSidepanelIsWorkflowCatalogKbEligible,
    testSidepanelFriendlyKnowledgeAnswerError,

    // ── Walkthrough export tests ──────────────────────────────────────
    testWalkthroughSelectorStrings,
    testWalkthroughBuildConfig,

    // ── FFmpeg local tests ────────────────────────────────────────────
    testFfmpegProgressToPercent,

    // ── Player audio capture tests ────────────────────────────────────
    testPlayerFindMediaElement,
    testPlayerCaptureAudioGuards,

    // ── Upload-post validation tests ──────────────────────────────────
    testUploadPostSubmitVideoValidation,
    testUploadPostCheckStatusValidation,
    testUploadPostCancelScheduledValidation,
    testUploadPostCreateUserProfileValidation,

    // ── Playback guard tests (require extension context) ───────────────
    testPlaybackGuardIsPlaybackActiveReturns,
    testPlaybackGuardEnsureBlockedWhenBusy,
    testPlaybackGuardForceBypass,
  ];

  // ── Player pure-function tests ─────────────────────────────────────

  function testPlayerFormatErr() {
    function formatErr(err) { return err?.message || String(err); }
    assertEqual(formatErr(new Error('boom')), 'boom');
    assertEqual(formatErr({ message: 'hello' }), 'hello');
  }

  function testPlayerFormatErrString() {
    function formatErr(err) { return err?.message || String(err); }
    assertEqual(formatErr('plain'), 'plain');
    assertEqual(formatErr(42), '42');
    assertEqual(formatErr(null), 'null');
    assertEqual(formatErr(undefined), 'undefined');
  }

  function testPlayerQcLastItemHasFailedNoItem() {
    function qcLastItemHasFailed(item, phrases) {
      var list = Array.isArray(phrases) && phrases.length ? phrases : ['failed generation', 'generation failed', 'something went wrong'];
      if (!item) return false;
      var text = (item.textContent || '').toLowerCase();
      if (!list.some(function(p) { return text.includes(p); })) return false;
      return item.querySelectorAll('video[src]').length === 0;
    }
    assertFalse(qcLastItemHasFailed(null), 'null item');
    assertFalse(qcLastItemHasFailed(undefined), 'undefined item');
  }

  function testPlayerQcLastItemHasFailedWithVideo() {
    function qcLastItemHasFailed(item, phrases) {
      var list = Array.isArray(phrases) && phrases.length ? phrases : ['failed generation'];
      if (!item) return false;
      var text = (item.textContent || '').toLowerCase();
      if (!list.some(function(p) { return text.includes(p); })) return false;
      return item.querySelectorAll('video[src]').length === 0;
    }
    var el = document.createElement('div');
    el.textContent = 'failed generation';
    var vid = document.createElement('video');
    vid.setAttribute('src', 'test.mp4');
    el.appendChild(vid);
    assertFalse(qcLastItemHasFailed(el), 'has video → not failed');
  }

  function testPlayerQcLastItemHasFailedMatch() {
    function qcLastItemHasFailed(item, phrases) {
      var list = Array.isArray(phrases) && phrases.length ? phrases : ['failed generation', 'generation failed', 'something went wrong'];
      if (!item) return false;
      var text = (item.textContent || '').toLowerCase();
      if (!list.some(function(p) { return text.includes(p); })) return false;
      return item.querySelectorAll('video[src]').length === 0;
    }
    var el = document.createElement('div');
    el.textContent = 'Something went wrong, try again';
    assertTrue(qcLastItemHasFailed(el), 'matches failure phrase without video');
  }

  function testPlayerQcLastItemHasFailedNoMatch() {
    function qcLastItemHasFailed(item, phrases) {
      var list = Array.isArray(phrases) && phrases.length ? phrases : ['failed generation'];
      if (!item) return false;
      var text = (item.textContent || '').toLowerCase();
      if (!list.some(function(p) { return text.includes(p); })) return false;
      return item.querySelectorAll('video[src]').length === 0;
    }
    var el = document.createElement('div');
    el.textContent = 'Ready to generate';
    assertFalse(qcLastItemHasFailed(el), 'no failure phrase → false');
  }

  function testPlayerApplyRowMappingEmpty() {
    function applyRowMapping(row, mapping) {
      if (!mapping || !Object.keys(mapping).length) return Object.assign({}, row);
      var result = Object.assign({}, row);
      for (var key in mapping) {
        if (mapping.hasOwnProperty(key)) result[key] = row[mapping[key]];
      }
      return result;
    }
    var row = { a: 1, b: 2 };
    assertDeepEqual(applyRowMapping(row, null), { a: 1, b: 2 }, 'null mapping → copy');
    assertDeepEqual(applyRowMapping(row, {}), { a: 1, b: 2 }, 'empty mapping → copy');
  }

  function testPlayerApplyRowMappingWithMapping() {
    function applyRowMapping(row, mapping) {
      if (!mapping || !Object.keys(mapping).length) return Object.assign({}, row);
      var result = Object.assign({}, row);
      for (var key in mapping) {
        if (mapping.hasOwnProperty(key)) result[key] = row[mapping[key]];
      }
      return result;
    }
    var row = { name: 'Alice', url: 'http://example.com' };
    var mapped = applyRowMapping(row, { targetName: 'name', targetUrl: 'url' });
    assertEqual(mapped.targetName, 'Alice');
    assertEqual(mapped.targetUrl, 'http://example.com');
    assertEqual(mapped.name, 'Alice', 'original keys preserved');
  }

  function testPlayerGetRowValueBasic() {
    function getRowValue(row) {
      if (!row || typeof row !== 'object') return '';
      var keys = Array.prototype.slice.call(arguments, 1).filter(Boolean);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (row[k] !== undefined) return row[k];
        var lower = (k || '').toLowerCase();
        var rks = Object.keys(row);
        for (var j = 0; j < rks.length; j++) {
          if ((rks[j] || '').toLowerCase() === lower) return row[rks[j]];
        }
      }
      return '';
    }
    assertEqual(getRowValue({ name: 'Alice' }, 'name'), 'Alice');
    assertEqual(getRowValue({ a: 1 }, 'a', 'b'), 1);
    assertEqual(getRowValue({ a: 1 }, 'b', 'a'), 1, 'second key fallback');
  }

  function testPlayerGetRowValueCaseInsensitive() {
    function getRowValue(row) {
      if (!row || typeof row !== 'object') return '';
      var keys = Array.prototype.slice.call(arguments, 1).filter(Boolean);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (row[k] !== undefined) return row[k];
        var lower = (k || '').toLowerCase();
        var rks = Object.keys(row);
        for (var j = 0; j < rks.length; j++) {
          if ((rks[j] || '').toLowerCase() === lower) return row[rks[j]];
        }
      }
      return '';
    }
    assertEqual(getRowValue({ Name: 'Bob' }, 'name'), 'Bob', 'case insensitive');
    assertEqual(getRowValue({ URL: 'http://x.com' }, 'url'), 'http://x.com');
  }

  function testPlayerGetRowValueMissing() {
    function getRowValue(row) {
      if (!row || typeof row !== 'object') return '';
      var keys = Array.prototype.slice.call(arguments, 1).filter(Boolean);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (row[k] !== undefined) return row[k];
      }
      return '';
    }
    assertEqual(getRowValue({}, 'x'), '', 'missing key → empty');
    assertEqual(getRowValue(null, 'x'), '', 'null row → empty');
    assertEqual(getRowValue(undefined, 'x'), '', 'undefined row → empty');
  }

  function testPlayerLooksLikeUploadTrigger() {
    function looksLikeUploadTrigger(action) {
      var t = ((action.text || '') + (action.tagName || '')).toLowerCase();
      var uploadWords = ['upload', 'choose', 'browse', 'file', 'add file', 'select file', 'attach', 'drop'];
      return uploadWords.some(function(w) { return t.includes(w); });
    }
    assertTrue(looksLikeUploadTrigger({ text: 'Upload Image' }), 'upload word');
    assertTrue(looksLikeUploadTrigger({ text: 'Choose File' }), 'choose word');
    assertTrue(looksLikeUploadTrigger({ text: '', tagName: 'input file' }), 'file in tagName');
    assertFalse(looksLikeUploadTrigger({ text: 'Submit form' }), 'no upload word');
    assertFalse(looksLikeUploadTrigger({ text: '', tagName: '' }), 'empty');
  }

  // ── Service worker helper tests ────────────────────────────────────

  function testApifyParseRetryAfterMsSeconds() {
    var APIFY_RETRY_AFTER_MAX_MS = 120000;
    function apifyParseRetryAfterMs(res) {
      try {
        var ra = res.headers.get('Retry-After');
        if (ra == null || ra === '') return 0;
        var s = String(ra).trim();
        if (/^\d+$/.test(s)) {
          var sec = parseInt(s, 10);
          if (sec > 0) return Math.min(sec * 1000, APIFY_RETRY_AFTER_MAX_MS);
          return 0;
        }
        var when = Date.parse(s);
        if (Number.isFinite(when)) {
          var delta = when - Date.now();
          if (delta > 0) return Math.min(delta, APIFY_RETRY_AFTER_MAX_MS);
        }
      } catch (_) {}
      return 0;
    }
    var r = { headers: new Map([['Retry-After', '5']]) };
    r.headers.get = function(k) { return this.has(k) ? this.entries().next().value[1] : null; };
    r.headers = { get: function() { return '5'; } };
    assertEqual(apifyParseRetryAfterMs(r), 5000, '5 seconds → 5000ms');
  }

  function testApifyParseRetryAfterMsMax() {
    var cap = 120000;
    function apifyParseRetryAfterMs(res) {
      try {
        var ra = res.headers.get('Retry-After');
        if (ra == null || ra === '') return 0;
        var s = String(ra).trim();
        if (/^\d+$/.test(s)) {
          var sec = parseInt(s, 10);
          if (sec > 0) return Math.min(sec * 1000, cap);
          return 0;
        }
      } catch (_) {}
      return 0;
    }
    var r = { headers: { get: function() { return '99999'; } } };
    assertEqual(apifyParseRetryAfterMs(r), cap, 'capped to 120s');
  }

  function testApifyParseRetryAfterMsEmpty() {
    function apifyParseRetryAfterMs(res) {
      try {
        var ra = res.headers.get('Retry-After');
        if (ra == null || ra === '') return 0;
      } catch (_) {}
      return 0;
    }
    assertEqual(apifyParseRetryAfterMs({ headers: { get: function() { return null; } } }), 0, 'null → 0');
    assertEqual(apifyParseRetryAfterMs({ headers: { get: function() { return ''; } } }), 0, 'empty → 0');
  }

  function testApifyFormatErrorDetailsString() {
    function apifyFormatErrorDetails(details, maxLen) {
      maxLen = maxLen || 600;
      if (details == null) return '';
      var s = typeof details === 'string' ? details : JSON.stringify(details);
      if (s.length > maxLen) return s.slice(0, maxLen) + '\u2026';
      return s;
    }
    assertEqual(apifyFormatErrorDetails('short error'), 'short error');
  }

  function testApifyFormatErrorDetailsTruncation() {
    function apifyFormatErrorDetails(details, maxLen) {
      maxLen = maxLen || 600;
      if (details == null) return '';
      var s = typeof details === 'string' ? details : JSON.stringify(details);
      if (s.length > maxLen) return s.slice(0, maxLen) + '\u2026';
      return s;
    }
    var long = 'x'.repeat(700);
    var result = apifyFormatErrorDetails(long);
    assertEqual(result.length, 601, 'truncated to 600 + ellipsis');
    assertTrue(result.endsWith('\u2026'), 'ends with ellipsis');
  }

  function testApifyFormatErrorDetailsObject() {
    function apifyFormatErrorDetails(details, maxLen) {
      maxLen = maxLen || 600;
      if (details == null) return '';
      var s;
      if (typeof details === 'string') s = details;
      else { try { s = JSON.stringify(details); } catch (_) { s = String(details); } }
      if (s.length > maxLen) return s.slice(0, maxLen) + '\u2026';
      return s;
    }
    assertEqual(apifyFormatErrorDetails({ key: 'val' }), '{"key":"val"}');
  }

  function testApifyFormatErrorDetailsNull() {
    function apifyFormatErrorDetails(details) {
      if (details == null) return '';
      return String(details);
    }
    assertEqual(apifyFormatErrorDetails(null), '', 'null → empty');
    assertEqual(apifyFormatErrorDetails(undefined), '', 'undefined → empty');
  }

  function testCfsSanitizeLlmChatMessages() {
    function cfsSanitizeLlmChatMessages(messages) {
      if (!Array.isArray(messages)) return [];
      var out = [];
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (!m || typeof m !== 'object') continue;
        var role = String(m.role || 'user').toLowerCase();
        if (role === 'assistant') role = 'assistant';
        else if (role === 'system') role = 'system';
        else role = 'user';
        var content = m.content;
        if (content != null && typeof content !== 'string') {
          try { content = JSON.stringify(content); } catch (_) { content = String(content); }
        } else {
          content = content != null ? String(content) : '';
        }
        out.push({ role: role, content: content });
      }
      return out;
    }
    var r = cfsSanitizeLlmChatMessages([{ role: 'user', content: 'hello' }, { role: 'ASSISTANT', content: 'hi' }]);
    assertEqual(r.length, 2);
    assertEqual(r[0].role, 'user');
    assertEqual(r[1].role, 'assistant');
    assertDeepEqual(cfsSanitizeLlmChatMessages(null), [], 'null → []');
    assertDeepEqual(cfsSanitizeLlmChatMessages('not array'), [], 'string → []');
    var obj = cfsSanitizeLlmChatMessages([{ role: 'user', content: { key: 'val' } }]);
    assertEqual(obj[0].content, '{"key":"val"}', 'object content serialized');
  }

  function testCfsValidateRemoteChatInputEmpty() {
    var MAX_MSG = 128;
    var MAX_CHARS = 400000;
    function cfsValidateRemoteChatInput(rawMessages) {
      if (!Array.isArray(rawMessages) || rawMessages.length === 0) return { ok: false, error: 'messages must be a non-empty array' };
      if (rawMessages.length > MAX_MSG) return { ok: false, error: 'Too many messages' };
      return { ok: true };
    }
    assertFalse(cfsValidateRemoteChatInput([]).ok, 'empty array → not ok');
    assertFalse(cfsValidateRemoteChatInput(null).ok, 'null → not ok');
    assertFalse(cfsValidateRemoteChatInput('x').ok, 'string → not ok');
  }

  function testCfsValidateRemoteChatInputTooMany() {
    var MAX_MSG = 128;
    function cfsValidateRemoteChatInput(rawMessages) {
      if (!Array.isArray(rawMessages) || rawMessages.length === 0) return { ok: false, error: 'messages must be a non-empty array' };
      if (rawMessages.length > MAX_MSG) return { ok: false, error: 'Too many messages' };
      return { ok: true };
    }
    var many = [];
    for (var i = 0; i < 200; i++) many.push({ role: 'user', content: 'x' });
    assertFalse(cfsValidateRemoteChatInput(many).ok, '200 messages → not ok');
  }

  function testCfsValidateRemoteChatInputValid() {
    var MAX_MSG = 128;
    var MAX_CHARS = 400000;
    function cfsValidateRemoteChatInput(rawMessages) {
      if (!Array.isArray(rawMessages) || rawMessages.length === 0) return { ok: false, error: 'messages must be a non-empty array' };
      if (rawMessages.length > MAX_MSG) return { ok: false, error: 'Too many messages' };
      var total = 0;
      for (var i = 0; i < rawMessages.length; i++) {
        total += (rawMessages[i].content && rawMessages[i].content.length) || 0;
      }
      if (total > MAX_CHARS) return { ok: false, error: 'Too large' };
      return { ok: true };
    }
    assertTrue(cfsValidateRemoteChatInput([{ role: 'user', content: 'hello' }]).ok, 'single message ok');
  }

  function testCfsValidateProjectRelativePath() {
    function cfsValidateProjectRelativePath(p) {
      if (typeof p !== 'string' || !p.trim()) return { ok: false, error: 'Path required' };
      var norm = p.replace(/^\/+|\/+$/g, '');
      if (!norm) return { ok: false, error: 'Path required' };
      if (norm.length > 512) return { ok: false, error: 'Path too long' };
      var parts = norm.split('/');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '..' || parts[i] === '') return { ok: false, error: 'Invalid path segment' };
      }
      return { ok: true, path: norm };
    }
    assertTrue(cfsValidateProjectRelativePath('foo/bar.json').ok, 'valid path');
    assertEqual(cfsValidateProjectRelativePath('foo/bar.json').path, 'foo/bar.json');
    assertFalse(cfsValidateProjectRelativePath('../etc/passwd').ok, 'traversal rejected');
    assertFalse(cfsValidateProjectRelativePath('').ok, 'empty rejected');
    assertFalse(cfsValidateProjectRelativePath(null).ok, 'null rejected');
    assertFalse(cfsValidateProjectRelativePath('foo//bar').ok, 'empty segment rejected');
    assertFalse(cfsValidateProjectRelativePath('a'.repeat(600)).ok, 'too long rejected');
  }

  // ── PersonalInfo sync tests ────────────────────────────────────────

  function testPersonalInfoNormalizeMode() {
    var pis = global.CFS_personalInfoSync;
    if (!pis) throw new Error('CFS_personalInfoSync not loaded');
    assertEqual(pis.normalizeMode('replacePhrase'), 'replacePhrase');
    assertEqual(pis.normalizeMode('replaceWholeElement'), 'replaceWholeElement');
    assertEqual(pis.normalizeMode('replaceRegexInElement'), 'replaceRegexInElement');
    assertEqual(pis.normalizeMode(undefined), 'replacePhrase', 'undefined defaults to replacePhrase');
    assertEqual(pis.normalizeMode('bogus'), 'replacePhrase', 'unknown defaults to replacePhrase');
  }

  function testPersonalInfoHasSelectors() {
    var pis = global.CFS_personalInfoSync;
    assertTrue(pis.hasSelectors({ selectors: [{ type: 'id', value: '#x' }] }));
    assertFalse(pis.hasSelectors({ selectors: [] }));
    assertFalse(pis.hasSelectors(null));
    assertFalse(pis.hasSelectors({}));
  }

  function testPersonalInfoSecretText() {
    var pis = global.CFS_personalInfoSync;
    assertEqual(pis.secretText({ text: 'hello' }), 'hello');
    assertEqual(pis.secretText({ pickedText: 'world' }), 'world');
    assertEqual(pis.secretText({ text: 'a', pickedText: 'b' }), 'a', 'text takes priority');
    assertEqual(pis.secretText(null), '');
    assertEqual(pis.secretText({}), '');
  }

  function testPersonalInfoIsPublishableWithoutSecret() {
    var pis = global.CFS_personalInfoSync;
    assertFalse(pis.isPublishableWithoutSecret(null));
    assertFalse(pis.isPublishableWithoutSecret({ selectors: [{ v: 1 }], mode: 'replacePhrase' }), 'phrase needs secret');
    assertTrue(pis.isPublishableWithoutSecret({ selectors: [{ v: 1 }], mode: 'replaceWholeElement' }), 'wholeElement is publishable');
    assertTrue(pis.isPublishableWithoutSecret({ selectors: [{ v: 1 }], mode: 'replaceRegexInElement', regex: '\\d+' }), 'regex with pattern is publishable');
    assertFalse(pis.isPublishableWithoutSecret({ selectors: [{ v: 1 }], mode: 'replaceRegexInElement' }), 'regex without pattern is not publishable');
    assertFalse(pis.isPublishableWithoutSecret({ selectors: [{ v: 1 }], mode: 'replaceWholeElement', localOnly: true }), 'localOnly items are not publishable');
  }

  function testPersonalInfoSanitizeForSync() {
    var pis = global.CFS_personalInfoSync;
    var arr = [
      { text: 'secret', selectors: [], mode: 'replacePhrase', replacementWord: '***' },
      { selectors: [{ type: 'id', value: '#x' }], mode: 'replaceWholeElement', replacementWord: 'REDACTED' },
      { text: 'secret2', localOnly: true, selectors: [{ v: 1 }], mode: 'replaceWholeElement' },
    ];
    var result = pis.sanitizePersonalInfoArrayForPublishedSync(arr);
    assertEqual(result.length, 1, 'only wholeElement non-local survives');
    assertEqual(result[0].mode, 'replaceWholeElement');
    assertEqual(result[0].replacementWord, 'REDACTED');
    assertTrue(result[0].text === undefined || result[0].text === null, 'text redacted');
  }

  function testPersonalInfoCloneWorkflowRedactsWhenPublished() {
    var pis = global.CFS_personalInfoSync;
    var wf = {
      published: true,
      personalInfo: [
        { text: 'SSN: 123-45-6789', selectors: [], mode: 'replacePhrase', replacementWord: '***' },
        { selectors: [{ type: 'id', value: '#q' }], mode: 'replaceWholeElement', replacementWord: 'PRIVATE' },
      ],
    };
    var cloned = pis.cloneWorkflowForPublishedSync(wf);
    assertEqual(cloned.personalInfo.length, 1, 'only publishable items survive');
    assertEqual(cloned.personalInfo[0].replacementWord, 'PRIVATE');
    var unpub = pis.cloneWorkflowForPublishedSync({ published: false, personalInfo: wf.personalInfo });
    assertEqual(unpub.personalInfo.length, 2, 'unpublished keeps all');
  }

  function testPersonalInfoApplyToTypedValue() {
    var pis = global.CFS_personalInfoSync;
    assertEqual(pis.applyToTypedValue(null, null, []), null, 'null passthrough');
    assertEqual(pis.applyToTypedValue('hello', null, []), 'hello', 'no personalInfo → passthrough');
    var pi = [{ text: 'secret123', replacementWord: '***' }];
    assertEqual(pis.applyToTypedValue('secret123', null, pi, null, null), '***', 'exact match replaced');
    assertEqual(pis.applyToTypedValue('other text', null, pi, null, null), 'other text', 'no match → original');
  }

  // ── Nested workflow loop tests ─────────────────────────────────────

  function testResolveNestedWorkflowsWithLoopSteps() {
    function resolveNestedWorkflowsInBackground(workflow, allWorkflows, seen) {
      if (!seen) seen = new Set();
      if (!workflow || !workflow.actions || !workflow.actions.length) return workflow;
      var resolved = JSON.parse(JSON.stringify(workflow));
      for (var i = 0; i < resolved.actions.length; i++) {
        var a = resolved.actions[i];
        if (a.type === 'runWorkflow' && a.workflowId) {
          var nested = allWorkflows[a.workflowId] && allWorkflows[a.workflowId].analyzed;
          if (!nested || !nested.actions || !nested.actions.length) return null;
          if (seen.has(a.workflowId)) return null;
          seen.add(a.workflowId);
          a.nestedWorkflow = resolveNestedWorkflowsInBackground(nested, allWorkflows, seen);
          seen.delete(a.workflowId);
          if (!a.nestedWorkflow) return null;
        }
        if (a.type === 'loop' && a.steps && a.steps.length) {
          for (var j = 0; j < a.steps.length; j++) {
            var s = a.steps[j];
            if (s.type === 'runWorkflow' && s.workflowId) {
              var nest2 = allWorkflows[s.workflowId] && allWorkflows[s.workflowId].analyzed;
              if (nest2 && nest2.actions && nest2.actions.length && !seen.has(s.workflowId)) {
                seen.add(s.workflowId);
                s.nestedWorkflow = resolveNestedWorkflowsInBackground(nest2, allWorkflows, seen);
                seen.delete(s.workflowId);
              }
            }
          }
        }
      }
      return resolved;
    }

    var allWf = {
      innerWf: { analyzed: { actions: [{ type: 'click' }, { type: 'type' }] } },
    };
    var parent = {
      actions: [
        { type: 'click' },
        { type: 'loop', steps: [
          { type: 'runWorkflow', workflowId: 'innerWf' },
          { type: 'click' },
        ]},
      ],
    };
    var result = resolveNestedWorkflowsInBackground(parent, allWf);
    assertTrue(result !== null, 'loop with runWorkflow resolves');
    var loopStep = result.actions[1];
    assertEqual(loopStep.type, 'loop');
    assertTrue(loopStep.steps[0].nestedWorkflow !== undefined, 'nestedWorkflow attached inside loop');
    assertEqual(loopStep.steps[0].nestedWorkflow.actions.length, 2, 'nested actions count');

    // Circular inside loop: should not crash (nestedWorkflow stays undefined)
    var circular = {
      selfRef: { analyzed: { actions: [{ type: 'loop', steps: [{ type: 'runWorkflow', workflowId: 'selfRef' }] }] } },
    };
    var circResult = resolveNestedWorkflowsInBackground(circular.selfRef.analyzed, circular);
    // selfRef loop step's runWorkflow won't get nested because selfRef is already in seen
    assertTrue(circResult !== null, 'circular in loop does not crash');
  }

  // ── Player DOM-based tests ─────────────────────────────────────────

  function testPlayerRunExtractDataBasic() {
    // Inline re-creation of runExtractData's core logic (DOM-only parts)
    function runExtractData(config, root) {
      var cfg = config || {};
      var doc = root || document;
      var listSelector = cfg.listSelector;
      var itemSelector = cfg.itemSelector || 'li';
      var fields = Array.isArray(cfg.fields) ? cfg.fields : [];
      var maxItems = typeof cfg.maxItems === 'number' && cfg.maxItems > 0 ? cfg.maxItems : 0;
      var list = null;
      if (typeof listSelector === 'string' && listSelector.trim()) {
        try { list = doc.querySelector(listSelector.trim()); } catch (_) {}
      }
      if (!list) return { ok: false, error: 'List container not found.' };
      var itemEls = [];
      try { itemEls = Array.from(list.querySelectorAll(itemSelector)); } catch (_) {}
      if (itemEls.length === 0) itemEls = Array.from(list.children).filter(function(el) { return el.nodeType === 1; });
      if (maxItems > 0 && itemEls.length > maxItems) itemEls = itemEls.slice(0, maxItems);
      if (itemEls.length === 0) return { ok: true, rows: [] };
      var rows = [];
      for (var i = 0; i < itemEls.length; i++) {
        var item = itemEls[i];
        var row = {};
        for (var j = 0; j < fields.length; j++) {
          var field = fields[j];
          var key = (field.key || '').trim() || 'value';
          var sels = field.selector;
          var text = '';
          if (typeof sels === 'string' && sels.trim()) {
            try {
              var el = item.querySelector(sels.trim());
              if (el) text = (el.textContent || el.value || '').trim();
            } catch (_) {}
          }
          row[key] = text;
        }
        if (Object.keys(row).length > 0) rows.push(row);
      }
      return { ok: true, rows: rows };
    }

    // Create DOM fixture
    var fixture = document.createElement('div');
    fixture.id = 'extract-fixture';
    var ul = document.createElement('ul');
    ul.setAttribute('data-list', '');
    var li1 = document.createElement('li');
    var span1 = document.createElement('span');
    span1.className = 'name';
    span1.textContent = 'Alice';
    li1.appendChild(span1);
    ul.appendChild(li1);
    var li2 = document.createElement('li');
    var span2 = document.createElement('span');
    span2.className = 'name';
    span2.textContent = 'Bob';
    li2.appendChild(span2);
    ul.appendChild(li2);
    fixture.appendChild(ul);
    document.body.appendChild(fixture);

    try {
      var result = runExtractData({
        listSelector: '[data-list]',
        itemSelector: 'li',
        fields: [{ key: 'name', selector: '.name' }],
      }, document.getElementById('extract-fixture'));
      assertTrue(result.ok, 'extract ok');
      assertEqual(result.rows.length, 2, '2 rows extracted');
      assertEqual(result.rows[0].name, 'Alice');
      assertEqual(result.rows[1].name, 'Bob');
    } finally {
      fixture.remove();
    }
  }

  function testPlayerRunExtractDataNoListContainer() {
    function runExtractData(config, root) {
      var cfg = config || {};
      var doc = root || document;
      var list = null;
      if (typeof cfg.listSelector === 'string' && cfg.listSelector.trim()) {
        try { list = doc.querySelector(cfg.listSelector.trim()); } catch (_) {}
      }
      if (!list) return { ok: false, error: 'List container not found.' };
      return { ok: true, rows: [] };
    }
    var result = runExtractData({ listSelector: '#nonexistent-list' });
    assertFalse(result.ok, 'returns error when list not found');
    assertTrue(result.error.indexOf('not found') >= 0, 'error message mentions not found');
  }

  function testPlayerRunExtractDataMaxItems() {
    function runExtractData(config, root) {
      var cfg = config || {};
      var doc = root || document;
      var list = null;
      if (typeof cfg.listSelector === 'string') {
        try { list = doc.querySelector(cfg.listSelector); } catch (_) {}
      }
      if (!list) return { ok: false, error: 'not found' };
      var itemEls = Array.from(list.querySelectorAll(cfg.itemSelector || 'li'));
      if (itemEls.length === 0) itemEls = Array.from(list.children).filter(function(el) { return el.nodeType === 1; });
      var maxItems = typeof cfg.maxItems === 'number' && cfg.maxItems > 0 ? cfg.maxItems : 0;
      if (maxItems > 0 && itemEls.length > maxItems) itemEls = itemEls.slice(0, maxItems);
      var rows = [];
      for (var i = 0; i < itemEls.length; i++) rows.push({ value: (itemEls[i].textContent || '').trim() });
      return { ok: true, rows: rows };
    }
    var fixture = document.createElement('div');
    fixture.id = 'extract-max-fixture';
    var ul = document.createElement('ul');
    ul.className = 'mlist';
    for (var i = 0; i < 5; i++) {
      var li = document.createElement('li');
      li.textContent = 'Item ' + i;
      ul.appendChild(li);
    }
    fixture.appendChild(ul);
    document.body.appendChild(fixture);
    try {
      var result = runExtractData({ listSelector: '.mlist', itemSelector: 'li', maxItems: 3 }, fixture);
      assertTrue(result.ok);
      assertEqual(result.rows.length, 3, 'capped to 3');
    } finally {
      fixture.remove();
    }
  }

  function testPlayerLastItemVideosRendered() {
    function lastItemVideosRendered(item) {
      if (!item) return 0;
      var n = 0;
      var videos = item.querySelectorAll('video[src]');
      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        if (v.readyState >= 1 || v.src) n++;
      }
      return n;
    }
    var div = document.createElement('div');
    assertEqual(lastItemVideosRendered(div), 0, 'no videos → 0');
    var v1 = document.createElement('video');
    v1.setAttribute('src', 'a.mp4');
    div.appendChild(v1);
    var v2 = document.createElement('video');
    v2.setAttribute('src', 'b.mp4');
    div.appendChild(v2);
    assertEqual(lastItemVideosRendered(div), 2, 'two videos → 2');
    assertEqual(lastItemVideosRendered(null), 0, 'null → 0');
  }

  function testPlayerLastItemStillGenerating() {
    function lastItemStillGenerating(item) {
      if (!item) return false;
      var text = (item.textContent || '').trim();
      return /\d{1,3}%/.test(text);
    }
    var el = document.createElement('div');
    el.textContent = 'Processing 45%';
    assertTrue(lastItemStillGenerating(el), '45% → still generating');
    el.textContent = 'Done!';
    assertFalse(lastItemStillGenerating(el), 'Done → not generating');
    el.textContent = '100%';
    assertTrue(lastItemStillGenerating(el), '100% → still matches');
    assertFalse(lastItemStillGenerating(null), 'null → false');
  }

  // ── Auto-discovery pure function tests ─────────────────────────────

  function testDiscoveryIsHintObject() {
    var HINT_ROOT_KEYS = new Set(['groupSelectors', 'inputCandidates', 'outputCandidates', 'preferMediaInGroup']);
    function isDiscoveryHintObject(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      for (var k of HINT_ROOT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
      }
      return false;
    }
    assertTrue(isDiscoveryHintObject({ groupSelectors: ['div'] }), 'has groupSelectors');
    assertTrue(isDiscoveryHintObject({ preferMediaInGroup: true }), 'has preferMediaInGroup');
    assertFalse(isDiscoveryHintObject(null), 'null');
    assertFalse(isDiscoveryHintObject([]), 'array');
    assertFalse(isDiscoveryHintObject({ someOtherKey: 1 }), 'no hint keys');
  }

  function testDiscoverySplitLegacyHints() {
    var HINT_ROOT_KEYS = new Set(['groupSelectors', 'inputCandidates', 'outputCandidates', 'preferMediaInGroup']);
    function isDiscoveryHintObject(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      for (var k of HINT_ROOT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
      }
      return false;
    }
    function splitLegacyDiscoveryHintsRaw(raw) {
      var domains = {};
      var globalHints = {};
      if (!raw || typeof raw !== 'object') return { domains: domains, globalHints: globalHints };
      for (var k in raw) {
        if (!raw.hasOwnProperty(k)) continue;
        if (HINT_ROOT_KEYS.has(k)) globalHints[k] = raw[k];
        else if (isDiscoveryHintObject(raw[k])) domains[k] = raw[k];
      }
      return { domains: domains, globalHints: globalHints };
    }
    var r = splitLegacyDiscoveryHintsRaw({
      groupSelectors: ['article'],
      'example.com': { inputCandidates: ['textarea'] },
    });
    assertDeepEqual(r.globalHints, { groupSelectors: ['article'] }, 'global hints extracted');
    assertTrue(r.domains['example.com'] !== undefined, 'domain extracted');
    assertDeepEqual(r.domains['example.com'], { inputCandidates: ['textarea'] });

    var empty = splitLegacyDiscoveryHintsRaw(null);
    assertDeepEqual(empty.domains, {}, 'null → empty domains');
    assertDeepEqual(empty.globalHints, {}, 'null → empty globalHints');
  }

  function testDiscoveryConcatUniqueArrays() {
    function concatUniqueArrays() {
      var seen = new Set();
      var out = [];
      for (var i = 0; i < arguments.length; i++) {
        var list = arguments[i];
        if (!Array.isArray(list)) continue;
        for (var j = 0; j < list.length; j++) {
          var s = list[j];
          if (typeof s !== 'string' || seen.has(s)) continue;
          seen.add(s);
          out.push(s);
        }
      }
      return out;
    }
    assertDeepEqual(concatUniqueArrays(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'], 'dedupes');
    assertDeepEqual(concatUniqueArrays(['x'], null, ['y']), ['x', 'y'], 'skips null');
    assertDeepEqual(concatUniqueArrays(), [], 'no args → empty');
    assertDeepEqual(concatUniqueArrays(['a', 'a']), ['a'], 'intra-array dedup');
  }

  function testDiscoveryMergeWorkflowHintsOrdered() {
    var HINT_ARRAY_FIELDS = ['groupSelectors', 'inputCandidates', 'outputCandidates'];
    function concatUniqueArrays() {
      var seen = new Set();
      var out = [];
      for (var i = 0; i < arguments.length; i++) {
        var list = arguments[i];
        if (!Array.isArray(list)) continue;
        for (var j = 0; j < list.length; j++) {
          var s = list[j];
          if (typeof s !== 'string' || seen.has(s)) continue;
          seen.add(s);
          out.push(s);
        }
      }
      return out;
    }
    function mergeWorkflowHintsOrdered(hintsList) {
      var W = {};
      var lockedEmpty = { groupSelectors: false, inputCandidates: false, outputCandidates: false };
      for (var i = 0; i < hintsList.length; i++) {
        var h = hintsList[i];
        if (!h || typeof h !== 'object') continue;
        for (var j = 0; j < HINT_ARRAY_FIELDS.length; j++) {
          var f = HINT_ARRAY_FIELDS[j];
          if (!Object.prototype.hasOwnProperty.call(h, f)) continue;
          var arr = h[f];
          if (!Array.isArray(arr)) continue;
          if (arr.length === 0) {
            W[f] = [];
            lockedEmpty[f] = true;
          } else if (!lockedEmpty[f]) {
            W[f] = concatUniqueArrays(W[f], arr);
          }
        }
        if (Object.prototype.hasOwnProperty.call(h, 'preferMediaInGroup') && !Object.prototype.hasOwnProperty.call(W, 'preferMediaInGroup')) {
          W.preferMediaInGroup = h.preferMediaInGroup;
        }
      }
      return W;
    }
    var merged = mergeWorkflowHintsOrdered([
      { groupSelectors: ['div.a'] },
      { groupSelectors: ['div.b', 'div.a'] },
    ]);
    assertDeepEqual(merged.groupSelectors, ['div.a', 'div.b'], 'merged and deduped');

    // Empty array locks the field
    var locked = mergeWorkflowHintsOrdered([
      { groupSelectors: [] },
      { groupSelectors: ['override'] },
    ]);
    assertDeepEqual(locked.groupSelectors, [], 'empty array locks field');

    // preferMediaInGroup: first wins
    var pref = mergeWorkflowHintsOrdered([
      { preferMediaInGroup: false },
      { preferMediaInGroup: true },
    ]);
    assertEqual(pref.preferMediaInGroup, false, 'first preferMediaInGroup wins');
  }

  function testDiscoveryNormalizeInput() {
    var HINT_ROOT_KEYS = new Set(['groupSelectors', 'inputCandidates', 'outputCandidates', 'preferMediaInGroup']);
    function isDiscoveryHintObject(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      for (var k of HINT_ROOT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
      }
      return false;
    }
    function splitLegacyDiscoveryHintsRaw(raw) {
      var domains = {};
      var globalHints = {};
      if (!raw || typeof raw !== 'object') return { domains: domains, globalHints: globalHints };
      for (var k in raw) {
        if (!raw.hasOwnProperty(k)) continue;
        if (HINT_ROOT_KEYS.has(k)) globalHints[k] = raw[k];
        else if (isDiscoveryHintObject(raw[k])) domains[k] = raw[k];
      }
      return { domains: domains, globalHints: globalHints };
    }
    function normalizeDiscoveryInput(data) {
      var discoveryDomains = data.discoveryDomains;
      var discoveryGlobalHints = data.discoveryGlobalHints && typeof data.discoveryGlobalHints === 'object' ? data.discoveryGlobalHints : {};
      if ((!discoveryDomains || Object.keys(discoveryDomains).length === 0) && data.discoveryHints && typeof data.discoveryHints === 'object') {
        var spl = splitLegacyDiscoveryHintsRaw(data.discoveryHints);
        if (Object.keys(spl.domains).length) {
          discoveryDomains = {};
          for (var d in spl.domains) {
            if (Object.prototype.hasOwnProperty.call(spl.domains, d)) discoveryDomains[d] = [spl.domains[d]];
          }
        }
        if (Object.keys(spl.globalHints).length && Object.keys(discoveryGlobalHints).length === 0) {
          discoveryGlobalHints = spl.globalHints;
        }
      }
      return {
        discoveryDomains: discoveryDomains && typeof discoveryDomains === 'object' ? discoveryDomains : {},
        discoveryGlobalHints: discoveryGlobalHints,
        discoveryStepHints: data.discoveryStepHints,
      };
    }
    // Modern format
    var result = normalizeDiscoveryInput({
      discoveryDomains: { 'example.com': [{ groupSelectors: ['div'] }] },
    });
    assertTrue(result.discoveryDomains['example.com'] !== undefined);

    // Legacy format
    var legacy = normalizeDiscoveryInput({
      discoveryHints: {
        groupSelectors: ['article'],
        'legacy.com': { inputCandidates: ['textarea'] },
      },
    });
    assertTrue(legacy.discoveryDomains['legacy.com'] !== undefined, 'legacy domain converted');
    assertDeepEqual(legacy.discoveryGlobalHints, { groupSelectors: ['article'] }, 'legacy global extracted');

    // Empty
    var empty = normalizeDiscoveryInput({});
    assertDeepEqual(empty.discoveryDomains, {});
    assertDeepEqual(empty.discoveryGlobalHints, {});
  }

  function testDiscoveryIsUnstableClassSelector() {
    function isUnstableClassSelector(sel) {
      if (sel.type !== 'class' || typeof sel.value !== 'string') return false;
      var parts = sel.value.split('.');
      var classParts = parts.filter(function(p, i) { return i > 0 && p.length > 0; });
      if (!classParts.length) return false;
      return classParts.every(function(p) { return p.length >= 5 && p.length <= 14 && /^[a-z0-9]+$/i.test(p); });
    }
    assertTrue(isUnstableClassSelector({ type: 'class', value: '.jaxwcM' }), 'CSS-in-JS hash class');
    assertTrue(isUnstableClassSelector({ type: 'class', value: '.abcdef.ghijkl' }), 'two hash parts');
    assertFalse(isUnstableClassSelector({ type: 'class', value: '.btn-primary' }), 'dash in name → stable');
    assertFalse(isUnstableClassSelector({ type: 'class', value: '.nav' }), 'short class → stable');
    assertFalse(isUnstableClassSelector({ type: 'id', value: '#myId' }), 'wrong type');
    assertFalse(isUnstableClassSelector({ type: 'class', value: '' }), 'empty value');
    assertFalse(isUnstableClassSelector({ type: 'class', value: '.a' }), 'too short class');
    assertTrue(isUnstableClassSelector({ type: 'class', value: '.Abcde12345' }), 'mixed case hash');
  }

  // ── GitHub extension update tests ──────────────────────────────────

  function testGitHubShouldSkipPath() {
    var SKIP_PREFIXES = ['node_modules/', '.git/', 'models/', '.cursor/', '.DS_Store'];
    function shouldSkipPath(rel) {
      if (!rel || typeof rel !== 'string') return true;
      var n = rel.replace(/\\/g, '/').replace(/^\/+/, '');
      for (var i = 0; i < SKIP_PREFIXES.length; i++) {
        if (n === SKIP_PREFIXES[i].replace(/\/$/, '') || n.indexOf(SKIP_PREFIXES[i]) === 0) return true;
      }
      return false;
    }
    assertTrue(shouldSkipPath('node_modules/foo/bar.js'), 'node_modules');
    assertTrue(shouldSkipPath('.git/config'), '.git');
    assertTrue(shouldSkipPath('.DS_Store'), '.DS_Store exact');
    assertTrue(shouldSkipPath('models/big.bin'), 'models');
    assertTrue(shouldSkipPath('.cursor/settings.json'), '.cursor');
    assertFalse(shouldSkipPath('shared/selectors.js'), 'normal path');
    assertFalse(shouldSkipPath('content/recorder.js'), 'content path');
    assertTrue(shouldSkipPath(null), 'null → skip');
    assertTrue(shouldSkipPath(''), 'empty → skip');
    assertFalse(shouldSkipPath('background/service-worker.js'), 'background path');
  }

  function testGitHubFormatSyncStateSummary() {
    var SYNC_STATE_FILENAME = 'github-sync-state.json';
    function formatSyncStateSummary(file) {
      if (!file || typeof file.baselineCommitSha !== 'string' || file.baselineCommitSha.length < 7) {
        return 'Sync file (' + SYNC_STATE_FILENAME + '): no baseline yet — use Record baseline.';
      }
      var short = file.baselineCommitSha.slice(0, 7);
      var mv = file.manifestVersion ? ' · extension v' + String(file.manifestVersion) : '';
      var at = file.updatedAt ? ' · updated ' + String(file.updatedAt).slice(0, 10) : '';
      return 'Sync file: baseline ' + short + mv + at;
    }
    var noBaseline = formatSyncStateSummary(null);
    assertTrue(noBaseline.indexOf('no baseline') >= 0, 'null → no baseline');

    var noSha = formatSyncStateSummary({ baselineCommitSha: 'abc' });
    assertTrue(noSha.indexOf('no baseline') >= 0, 'short sha → no baseline');

    var full = formatSyncStateSummary({
      baselineCommitSha: 'abc1234567890',
      manifestVersion: '2.5.0',
      updatedAt: '2026-03-15T12:00:00Z',
    });
    assertTrue(full.indexOf('abc1234') >= 0, 'sha truncated to 7');
    assertTrue(full.indexOf('v2.5.0') >= 0, 'version shown');
    assertTrue(full.indexOf('2026-03-15') >= 0, 'date shown');

    var noVersion = formatSyncStateSummary({
      baselineCommitSha: 'xyz7890abcdef',
    });
    assertTrue(noVersion.indexOf('xyz7890') >= 0); 
    assertFalse(noVersion.indexOf('extension v') >= 0, 'no version omits v');
  }

  // ── Sidepanel pure function tests ──────────────────────────────────

  function testSidepanelFormatTimeAgo() {
    function formatTimeAgo(ts) {
      if (ts == null || isNaN(new Date(ts).getTime())) return '';
      var sec = Math.floor((Date.now() - ts) / 1000);
      if (sec < 60) return 'just now';
      if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
      if (sec < 86400) return Math.floor(sec / 3600) + ' hr ago';
      if (sec < 172800) return 'yesterday';
      return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    assertEqual(formatTimeAgo(null), '', 'null → empty');
    assertEqual(formatTimeAgo(undefined), '', 'undefined → empty');
    assertEqual(formatTimeAgo(Date.now() - 10000), 'just now', '10s ago');
    assertEqual(formatTimeAgo(Date.now() - 120000), '2 min ago', '2 min ago');
    assertEqual(formatTimeAgo(Date.now() - 7200000), '2 hr ago', '2 hr ago');
    assertEqual(formatTimeAgo(Date.now() - 90000000), 'yesterday', '~25hr ago');
    // Very old → date string (not empty)
    var old = formatTimeAgo(Date.now() - 500000000);
    assertTrue(old.length > 0, 'old date has text');
    assertTrue(old !== 'yesterday', 'old date is not yesterday');
  }

  function testSidepanelIsRestrictedUrl() {
    function isRestrictedUrl(url) {
      return url && (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:'));
    }
    assertTrue(isRestrictedUrl('chrome://extensions'), 'chrome://');
    assertTrue(isRestrictedUrl('chrome-extension://abc123/popup.html'), 'chrome-extension://');
    assertTrue(isRestrictedUrl('edge://settings'), 'edge://');
    assertTrue(isRestrictedUrl('about:blank'), 'about:');
    assertFalse(isRestrictedUrl('https://example.com'), 'normal https');
    assertFalse(isRestrictedUrl('http://localhost:3000'), 'localhost');
    assertFalse(isRestrictedUrl(null), 'null');
    assertFalse(isRestrictedUrl(''), 'empty');
  }

  function testSidepanelUrlMatchesPattern() {
    function urlMatchesPattern(pageUrl, pattern) {
      if (!pattern || !pattern.trim()) return true;
      try {
        var page = new URL(pageUrl);
        var p = pattern.trim();
        if (p.startsWith('*.')) {
          var domain = p.slice(2);
          return page.hostname === domain || page.hostname.endsWith('.' + domain);
        }
        var patternUrl = new URL(p.startsWith('http') ? p : 'https://' + p);
        return page.origin === patternUrl.origin || page.hostname === patternUrl.hostname;
      } catch (_) {
        return false;
      }
    }
    assertTrue(urlMatchesPattern('https://example.com/path', ''), 'empty pattern → true');
    assertTrue(urlMatchesPattern('https://example.com/path', 'example.com'), 'hostname match');
    assertTrue(urlMatchesPattern('https://sub.example.com/path', '*.example.com'), 'wildcard subdomain');
    assertTrue(urlMatchesPattern('https://example.com/', '*.example.com'), 'wildcard exact');
    assertFalse(urlMatchesPattern('https://other.com/', 'example.com'), 'different domain');
    assertFalse(urlMatchesPattern('https://notexample.com/', '*.example.com'), 'partial mismatch');
    assertTrue(urlMatchesPattern('https://example.com/', 'https://example.com'), 'full URL pattern');
  }

  function testSidepanelIsTestWorkflow() {
    function isTestWorkflow(w) {
      if (w && w._testOnly) return true;
      var name = (w && w.name) ? w.name.toLowerCase().trim() : '';
      if (!name) return false;
      if (/\be2e\b/.test(name)) return true;
      if (name === 'test' || /^test(\s|$|:|_|\.|-)/i.test(name)) return true;
      return false;
    }
    assertTrue(isTestWorkflow({ name: 'test' }), 'exact "test"');
    assertTrue(isTestWorkflow({ name: 'Test: something' }), '"Test:" prefix');
    assertTrue(isTestWorkflow({ name: 'test_workflow' }), '"test_" prefix');
    assertTrue(isTestWorkflow({ name: 'e2e login flow' }), 'e2e keyword');
    assertTrue(isTestWorkflow({ _testOnly: true, name: 'prod' }), '_testOnly flag');
    assertFalse(isTestWorkflow({ name: 'My Workflow' }), 'normal workflow');
    assertFalse(isTestWorkflow({ name: 'Latest content' }), 'no test pattern');
    assertFalse(isTestWorkflow({ name: 'Crypto Test Wallet' }), 'does not flag user names');
    assertFalse(isTestWorkflow({ name: 'attestation' }), 'does not flag substrings');
  }

  function testSidepanelNormalizeScriptingError() {
    function normalizeScriptingError(err) {
      var msg = (err && err.message) ? String(err.message) : String(err);
      if (/cannot access contents|cannot be scripted|restricted|chrome:\/\/|edge:\/\//i.test(msg)) {
        return "This tab doesn't support the extension (e.g. chrome:// or extension page). Open your workflow's start URL in this tab.";
      }
      return msg;
    }
    var restricted = normalizeScriptingError(new Error('Cannot access contents of this page'));
    assertTrue(restricted.indexOf("doesn't support") >= 0, 'restricted → user-friendly');
    var chromeErr = normalizeScriptingError(new Error('chrome://extensions'));
    assertTrue(chromeErr.indexOf("doesn't support") >= 0, 'chrome:// → user-friendly');
    var normal = normalizeScriptingError(new Error('Something else broke'));
    assertEqual(normal, 'Something else broke', 'pass-through normal');
  }

  function testSidepanelNormalizePlaybackError() {
    function normalizePlaybackError(res) {
      var raw = (res && res.error) ? String(res.error) : '';
      var isConnection = /receiving end does not exist|could not establish connection|target closed|tab was closed|message port closed/i.test(raw);
      if (isConnection) {
        return { message: "Extension couldn't run on this tab. Reload the page and try again, or open your workflow's start URL.", isConnection: true };
      }
      return { message: raw || 'unknown', isConnection: false };
    }
    var conn = normalizePlaybackError({ error: 'Receiving end does not exist' });
    assertTrue(conn.isConnection, 'isConnection=true');
    assertTrue(conn.message.indexOf('Reload') >= 0, 'user-friendly message');
    var other = normalizePlaybackError({ error: 'Element not found' });
    assertFalse(other.isConnection, 'isConnection=false');
    assertEqual(other.message, 'Element not found');
    var empty = normalizePlaybackError({});
    assertEqual(empty.message, 'unknown');
  }

  function testSidepanelWorkflowContainsStepType() {
    function workflowContainsStepType(node, stepType) {
      var actions = node && (node.actions || (node.analyzed && node.analyzed.actions));
      if (!Array.isArray(actions)) return false;
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        if (!a || typeof a !== 'object') continue;
        if (a.type === stepType) return true;
        if (a.type === 'runWorkflow' && a.nestedWorkflow && workflowContainsStepType(a.nestedWorkflow, stepType)) return true;
        if (a.type === 'loop' && Array.isArray(a.steps)) {
          for (var j = 0; j < a.steps.length; j++) {
            var s = a.steps[j];
            if (!s || typeof s !== 'object') continue;
            if (s.type === stepType) return true;
            if (s.type === 'runWorkflow' && s.nestedWorkflow && workflowContainsStepType(s.nestedWorkflow, stepType)) return true;
          }
        }
      }
      return false;
    }
    assertTrue(workflowContainsStepType({ actions: [{ type: 'click' }, { type: 'apifyActorRun' }] }, 'apifyActorRun'), 'flat actions');
    assertFalse(workflowContainsStepType({ actions: [{ type: 'click' }] }, 'apifyActorRun'), 'not present');
    assertTrue(workflowContainsStepType({
      actions: [{ type: 'runWorkflow', nestedWorkflow: { actions: [{ type: 'apifyActorRun' }] } }]
    }, 'apifyActorRun'), 'nested workflow');
    assertTrue(workflowContainsStepType({
      actions: [{ type: 'loop', steps: [{ type: 'apifyActorRun' }] }]
    }, 'apifyActorRun'), 'inside loop');
    assertFalse(workflowContainsStepType(null, 'click'), 'null node');
    assertFalse(workflowContainsStepType({ actions: [] }, 'click'), 'empty actions');
  }

  function testSidepanelGetDelayBeforeNextRunMs() {
    function getDelayBeforeNextRunMs(resolvedOrWf) {
      var actions = (resolvedOrWf && resolvedOrWf.actions) || (resolvedOrWf && resolvedOrWf.analyzed && resolvedOrWf.analyzed.actions) || [];
      for (var j = actions.length - 1; j >= 0; j--) {
        var a = actions[j];
        if (a.type !== 'delayBeforeNextRun') continue;
        if (a.delayMinMs != null && a.delayMaxMs != null) {
          var min = Math.max(0, parseInt(a.delayMinMs, 10) || 0);
          var max = Math.max(min, parseInt(a.delayMaxMs, 10) || min);
          return min === max ? min : min + Math.floor((max - min + 1) * Math.random());
        }
        if (a.delayMs != null) return Math.max(0, parseInt(a.delayMs, 10) || 0);
        return 0;
      }
      return 0;
    }
    assertEqual(getDelayBeforeNextRunMs({ actions: [] }), 0, 'no delay step → 0');
    assertEqual(getDelayBeforeNextRunMs({ actions: [{ type: 'delayBeforeNextRun', delayMs: 5000 }] }), 5000, 'exact delayMs');
    assertEqual(getDelayBeforeNextRunMs({ actions: [{ type: 'click' }, { type: 'delayBeforeNextRun', delayMs: 3000 }] }), 3000, 'last step wins');
    var ranged = getDelayBeforeNextRunMs({ actions: [{ type: 'delayBeforeNextRun', delayMinMs: 1000, delayMaxMs: 1000 }] });
    assertEqual(ranged, 1000, 'min == max → exact');
    assertEqual(getDelayBeforeNextRunMs(null), 0, 'null → 0');
  }

  function testSidepanelWorkflowNeedsVideoBatchWait() {
    function workflowNeedsVideoBatchWait(resolvedOrWf) {
      var actions = (resolvedOrWf && resolvedOrWf.actions) || (resolvedOrWf && resolvedOrWf.analyzed && resolvedOrWf.analyzed.actions) || [];
      return actions.some(function(a) { return a.type === 'checkSuccessfulGenerations' || a.type === 'waitForVideos'; });
    }
    assertTrue(workflowNeedsVideoBatchWait({ actions: [{ type: 'click' }, { type: 'waitForVideos' }] }), 'has waitForVideos');
    assertTrue(workflowNeedsVideoBatchWait({ actions: [{ type: 'checkSuccessfulGenerations' }] }), 'has checkSuccessful');
    assertFalse(workflowNeedsVideoBatchWait({ actions: [{ type: 'click' }, { type: 'type' }] }), 'no generation steps');
    assertFalse(workflowNeedsVideoBatchWait({ actions: [] }), 'empty');
  }

  function testSidepanelIsWorkflowCatalogKbEligible() {
    function isWorkflowCatalogKbEligibleForAnswer(wf) {
      if (!wf || typeof wf !== 'object') return false;
      if (wf.archived === true) return false;
      if (!wf.published) return false;
      if (wf.private !== false) return false;
      if (wf.approved !== true) return false;
      return true;
    }
    assertTrue(isWorkflowCatalogKbEligibleForAnswer({ published: true, private: false, approved: true }), 'eligible');
    assertFalse(isWorkflowCatalogKbEligibleForAnswer({ published: true, private: false, approved: false }), 'not approved');
    assertFalse(isWorkflowCatalogKbEligibleForAnswer({ published: true, private: true, approved: true }), 'private');
    assertFalse(isWorkflowCatalogKbEligibleForAnswer({ published: false, private: false, approved: true }), 'not published');
    assertFalse(isWorkflowCatalogKbEligibleForAnswer({ published: true, private: false, approved: true, archived: true }), 'archived');
    assertFalse(isWorkflowCatalogKbEligibleForAnswer(null), 'null');
  }

  function testSidepanelFriendlyKnowledgeAnswerError() {
    function friendlyKnowledgeAnswerErrorMessage(msg) {
      var s = String(msg || '');
      if (/workflow_kb_check_bypass|knowledge_answers.*schema cache|schema cache/i.test(s)) {
        return 'Server database needs migration: add knowledge_answers.workflow_kb_check_bypass (boolean, default false). See docs/BACKEND_IMPLEMENTATION_PROMPT.md §8.';
      }
      return s;
    }
    var migration = friendlyKnowledgeAnswerErrorMessage('knowledge_answers schema cache issue');
    assertTrue(migration.indexOf('migration') >= 0, 'schema cache → migration msg');
    var bypass = friendlyKnowledgeAnswerErrorMessage('workflow_kb_check_bypass');
    assertTrue(bypass.indexOf('migration') >= 0, 'bypass check → migration msg');
    var normal = friendlyKnowledgeAnswerErrorMessage('Timeout error');
    assertEqual(normal, 'Timeout error', 'pass-through');
    var empty = friendlyKnowledgeAnswerErrorMessage('');
    assertEqual(empty, '', 'empty pass-through');
  }

  // ── Walkthrough export tests ───────────────────────────────────────

  function testWalkthroughSelectorStrings() {
    // inline from walkthrough-export.js
    function selectorStrings(action) {
      var list = [].concat((action && action.selectors) || [], (action && action.fallbackSelectors) || []);
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (typeof s === 'string' && s.trim()) { out.push(s.trim()); continue; }
        if (s && typeof s.value === 'string') { out.push(s.value.trim()); continue; }
        if (s && typeof s.selector === 'string') { out.push(s.selector.trim()); continue; }
      }
      return out;
    }
    assertDeepEqual(selectorStrings({ selectors: ['.btn'] }), ['.btn'], 'string selector');
    assertDeepEqual(selectorStrings({ selectors: [{ value: '#id' }] }), ['#id'], 'object value');
    assertDeepEqual(selectorStrings({ selectors: [{ selector: 'div.x' }] }), ['div.x'], 'object selector');
    assertDeepEqual(selectorStrings({ selectors: ['.a'], fallbackSelectors: ['.b'] }), ['.a', '.b'], 'primary+fallback');
    assertDeepEqual(selectorStrings({}), [], 'empty');
    assertDeepEqual(selectorStrings(null), [], 'null');
  }

  function testWalkthroughBuildConfig() {
    function selectorStrings(action) {
      var list = [].concat((action && action.selectors) || [], (action && action.fallbackSelectors) || []);
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (typeof s === 'string' && s.trim()) { out.push(s.trim()); continue; }
        if (s && typeof s.value === 'string') { out.push(s.value.trim()); continue; }
        if (s && typeof s.selector === 'string') { out.push(s.selector.trim()); continue; }
      }
      return out;
    }
    function getStepCommentSummary(comment, maxLength) {
      if (!comment || typeof comment !== 'object') return '';
      var parts = [];
      if (comment.items && comment.items.length) {
        for (var ti = 0; ti < comment.items.length; ti++) {
          if (comment.items[ti].type === 'text' && comment.items[ti].text) parts.push(String(comment.items[ti].text).trim());
        }
      }
      var text = parts.length ? parts.join('\n\n') : String(comment.text || '').trim();
      if (!text) return '';
      if (maxLength != null && text.length > maxLength) return text.slice(0, maxLength) + '\u2026';
      return text;
    }
    function buildWalkthroughConfig(workflow, options) {
      options = options || {};
      var actions = (workflow && workflow.analyzed && workflow.analyzed.actions) ? workflow.analyzed.actions : [];
      var steps = [];
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        var type = a.type || 'step';
        var selectors = selectorStrings(a);
        var tooltip = getStepCommentSummary(a.comment, 300) || (a.stepLabel || '').trim() || (type + ' ' + (i + 1));
        var step = { index: i + 1, type: type, selectors: selectors, tooltip: tooltip, optional: !!a.optional };
        if (options.includeQuiz && selectors.length > 0) {
          step.quizQuestion = (tooltip && tooltip.length > 10) ? tooltip : 'What should you click or do next?';
        }
        steps.push(step);
      }
      return { name: (workflow && workflow.name) ? workflow.name : 'Walkthrough', workflowId: workflow && workflow.id, steps: steps };
    }
    var config = buildWalkthroughConfig({
      id: 'wf1',
      name: 'Login Flow',
      analyzed: {
        actions: [
          { type: 'click', selectors: ['.btn-login'], stepLabel: 'Click login' },
          { type: 'type', selectors: ['#email'], comment: { text: 'Enter your email address' } },
          { type: 'click', selectors: [] },
        ],
      },
    });
    assertEqual(config.name, 'Login Flow');
    assertEqual(config.workflowId, 'wf1');
    assertEqual(config.steps.length, 3, '3 steps');
    assertEqual(config.steps[0].tooltip, 'Click login', 'stepLabel used');
    assertEqual(config.steps[1].tooltip, 'Enter your email address', 'comment.text used');
    assertEqual(config.steps[2].tooltip, 'click 3', 'fallback type+index');
    assertDeepEqual(config.steps[0].selectors, ['.btn-login']);

    // includeQuiz
    var quizConfig = buildWalkthroughConfig({
      analyzed: { actions: [{ type: 'click', selectors: ['.x'] }] },
    }, { includeQuiz: true });
    assertTrue(quizConfig.steps[0].quizQuestion !== undefined, 'quiz question added');

    // empty workflow
    var empty = buildWalkthroughConfig({});
    assertEqual(empty.steps.length, 0);
    assertEqual(empty.name, 'Walkthrough');
  }

  // ── FFmpeg local tests ─────────────────────────────────────────────

  function testFfmpegProgressToPercent() {
    function ffmpegProgressToPercent(ev) {
      if (!ev || typeof ev !== 'object') return null;
      var r = ev.progress;
      if (typeof r !== 'number' || !isFinite(r)) {
        r = ev.ratio;
      }
      if (typeof r !== 'number' || !isFinite(r)) return null;
      if (r >= 0 && r <= 1) return Math.max(0, Math.min(100, Math.round(r * 100)));
      if (r > 1 && r <= 100) return Math.round(r);
      return null;
    }
    assertEqual(ffmpegProgressToPercent({ progress: 0.5 }), 50, '0.5 → 50%');
    assertEqual(ffmpegProgressToPercent({ progress: 0 }), 0, '0 → 0%');
    assertEqual(ffmpegProgressToPercent({ progress: 1 }), 100, '1 → 100%');
    assertEqual(ffmpegProgressToPercent({ progress: 0.333 }), 33, '0.333 → 33%');
    assertEqual(ffmpegProgressToPercent({ ratio: 0.75 }), 75, 'ratio fallback');
    assertEqual(ffmpegProgressToPercent({ progress: 42 }), 42, 'already percent');
    assertEqual(ffmpegProgressToPercent({ progress: 100 }), 100, '100 passthrough');
    assertEqual(ffmpegProgressToPercent(null), null, 'null → null');
    assertEqual(ffmpegProgressToPercent({}), null, 'no progress → null');
    assertEqual(ffmpegProgressToPercent({ progress: Infinity }), null, 'Infinity → null');
    assertEqual(ffmpegProgressToPercent({ progress: -5 }), null, 'negative → null');
    assertEqual(ffmpegProgressToPercent({ progress: 200 }), null, '>100 → null');
  }

  // ── Player audio capture tests ─────────────────────────────────────

  function testPlayerFindMediaElement() {
    // Inline the findMediaElement logic from player.js
    function findMediaElement(el) {
      if (!el) return null;
      if (el instanceof HTMLMediaElement) return el;
      var found = el.closest('video, audio') || el.querySelector('video, audio');
      if (found) return found;
      var parent = el.parentElement;
      for (var i = 0; i < 8 && parent; i++) {
        var v = parent.querySelector('video, audio');
        if (v) return v;
        parent = parent.parentElement;
      }
      return null;
    }

    // null input
    assertEqual(findMediaElement(null), null, 'null → null');

    // Direct video element
    var vid = document.createElement('video');
    assertEqual(findMediaElement(vid), vid, 'direct video element');

    // Direct audio element
    var aud = document.createElement('audio');
    assertEqual(findMediaElement(aud), aud, 'direct audio element');

    // Child video inside a div
    var div = document.createElement('div');
    var childVid = document.createElement('video');
    div.appendChild(childVid);
    assertEqual(findMediaElement(div), childVid, 'child video in div');

    // Parent walk-up: button with video sibling
    var container = document.createElement('div');
    var siblingVid = document.createElement('video');
    var btn = document.createElement('button');
    container.appendChild(siblingVid);
    container.appendChild(btn);
    assertEqual(findMediaElement(btn), siblingVid, 'sibling video via parent lookup');

    // No media element anywhere
    var emptyDiv = document.createElement('div');
    var span = document.createElement('span');
    emptyDiv.appendChild(span);
    assertEqual(findMediaElement(span), null, 'no media → null');
  }

  function testPlayerCaptureAudioGuards() {
    // Test the cross-origin error detection logic inlined from captureAudioFromElement
    function detectCrossOriginError(errorMsg) {
      var msg = (errorMsg || '').toLowerCase();
      if (msg.includes('cross-origin') || msg.includes('crossorigin')) {
        return 'Cross-origin media. Use the Tab audio button to capture via the picker.';
      }
      return null;
    }
    assertEqual(
      detectCrossOriginError('Failed to execute: cross-origin resource'),
      'Cross-origin media. Use the Tab audio button to capture via the picker.',
      'cross-origin detected'
    );
    assertEqual(
      detectCrossOriginError('crossOrigin attribute required'),
      'Cross-origin media. Use the Tab audio button to capture via the picker.',
      'crossOrigin detected'
    );
    assertEqual(detectCrossOriginError('Some other error'), null, 'non-cross-origin passes through');
    assertEqual(detectCrossOriginError(''), null, 'empty string');
    assertEqual(detectCrossOriginError(null), null, 'null');

    // Test duration clamping logic from captureAudioFromElement
    function clampDuration(durationMs) {
      return Math.min(Math.max(durationMs || 5000, 1000), 60000);
    }
    assertEqual(clampDuration(undefined), 5000, 'default 5s');
    assertEqual(clampDuration(0), 5000, 'zero → default 5s');
    assertEqual(clampDuration(500), 1000, 'below min → 1s');
    assertEqual(clampDuration(30000), 30000, 'normal 30s');
    assertEqual(clampDuration(120000), 60000, 'above max → 60s');
  }

  // ── Upload-post validation tests ───────────────────────────────────

  function testUploadPostSubmitVideoValidation() {
    // Test submitVideo's input validation (before any fetch calls)
    // Inline the validation logic
    function validateSubmitVideoParams(params) {
      if (!params.video && !(typeof params.video === 'string' && params.video)) {
        if (!(params.video instanceof File)) {
          return { ok: false, error: 'Missing video file or URL' };
        }
      }
      return { ok: true };
    }
    // Actually test the exact logic from upload-post.js
    function submitVideoValidation(params) {
      if (params.video instanceof File) return { ok: true };
      if (typeof params.video === 'string' && params.video) return { ok: true };
      return { ok: false, error: 'Missing video file or URL' };
    }
    assertEqual(submitVideoValidation({ video: 'https://example.com/v.mp4' }).ok, true, 'URL video');
    assertEqual(submitVideoValidation({ video: new File(['data'], 'v.mp4') }).ok, true, 'File video');
    assertEqual(submitVideoValidation({}).ok, false, 'missing video');
    assertEqual(submitVideoValidation({ video: '' }).ok, false, 'empty string');
    assertEqual(submitVideoValidation({ video: null }).ok, false, 'null video');
    assertEqual(submitVideoValidation({ video: 0 }).ok, false, 'number');
  }

  function testUploadPostCheckStatusValidation() {
    // Inline the param validation from checkStatus
    function checkStatusValidation(params) {
      if (!params.request_id && !params.job_id) return { ok: false, error: 'request_id or job_id required' };
      return { ok: true };
    }
    assertEqual(checkStatusValidation({ request_id: 'abc' }).ok, true, 'request_id');
    assertEqual(checkStatusValidation({ job_id: 'xyz' }).ok, true, 'job_id');
    assertEqual(checkStatusValidation({}).ok, false, 'neither');
    assertEqual(checkStatusValidation({}).error, 'request_id or job_id required');
  }

  function testUploadPostCancelScheduledValidation() {
    function cancelScheduledValidation(jobId) {
      if (!jobId || !String(jobId).trim()) return { ok: false, error: 'job_id required' };
      return { ok: true };
    }
    assertEqual(cancelScheduledValidation('abc').ok, true, 'valid');
    assertEqual(cancelScheduledValidation('').ok, false, 'empty');
    assertEqual(cancelScheduledValidation(null).ok, false, 'null');
    assertEqual(cancelScheduledValidation(undefined).ok, false, 'undefined');
    assertEqual(cancelScheduledValidation('   ').ok, false, 'whitespace');
  }

  function testUploadPostCreateUserProfileValidation() {
    function createUserProfileValidation(apiKey, username) {
      var key = typeof apiKey === 'string' ? apiKey.trim() : '';
      var u = typeof username === 'string' ? username.trim() : '';
      if (!key) return { ok: false, error: 'API key not set' };
      if (!u) return { ok: false, error: 'username required' };
      return { ok: true };
    }
    assertEqual(createUserProfileValidation('key123', 'user1').ok, true, 'valid');
    assertEqual(createUserProfileValidation('', 'user1').ok, false, 'empty key');
    assertEqual(createUserProfileValidation('key123', '').ok, false, 'empty username');
    assertEqual(createUserProfileValidation(null, 'user1').ok, false, 'null key');
    assertEqual(createUserProfileValidation('key123', null).ok, false, 'null username');
    assertEqual(createUserProfileValidation('  ', 'user1').ok, false, 'whitespace key');
    assertEqual(createUserProfileValidation('key123', '  ').ok, false, 'whitespace username');
    assertEqual(createUserProfileValidation('', '').error, 'API key not set', 'key error first');
  }


  /** DeFi action patterns */
  function testDefiActionPatternsMatchUrl() {
    var p = global.__CFS_DEFI_ACTION_PATTERNS;
    if (!p || typeof p.matchUrl !== 'function') return; /* skip in envs without the module */
    var raydium = p.matchUrl('https://app.raydium.io/swap?inputMint=So11&outputMint=USDC');
    assertTrue(raydium.length > 0, 'raydium swap URL matches');
    assertEqual(raydium[0].id, 'raydium-swap');
    assertEqual(raydium[0].chain, 'solana');

    var jup = p.matchUrl('https://jup.ag/swap/SOL-BONK');
    assertTrue(jup.length > 0, 'jupiter URL matches');
    assertEqual(jup[0].platform, 'jupiter');

    var pancake = p.matchUrl('https://pancakeswap.finance/swap');
    assertTrue(pancake.length > 0, 'pancakeswap URL matches');
    assertEqual(pancake[0].chain, 'bsc');

    var noMatch = p.matchUrl('https://google.com');
    assertEqual(noMatch.length, 0, 'non-DeFi URL returns empty');

    var empty = p.matchUrl('');
    assertEqual(empty.length, 0, 'empty URL returns empty');
  }

  function testDefiActionPatternsMatchSelector() {
    var p = global.__CFS_DEFI_ACTION_PATTERNS;
    if (!p || typeof p.matchSelector !== 'function') return;
    var res = p.matchSelector('https://app.raydium.io/swap', 'swap-input-amount');
    assertTrue(res !== null, 'amount selector matches');
    assertEqual(res.role, 'amount');
    assertEqual(res.patternId, 'raydium-swap');

    var noMatch = p.matchSelector('https://app.raydium.io/swap', 'random-element');
    assertEqual(noMatch, null, 'random selector returns null');

    var noUrl = p.matchSelector('https://google.com', 'swap-button');
    assertEqual(noUrl, null, 'non-DeFi URL returns null');
  }

  function testDefiActionPatternsSuggestApiConversion() {
    var p = global.__CFS_DEFI_ACTION_PATTERNS;
    if (!p || typeof p.suggestApiConversion !== 'function') return;
    var actions = [
      { type: 'type', selectors: ['swap-input-amount'], value: '1000000' },
      { type: 'click', selectors: ['swap-button'] },
    ];
    var result = p.suggestApiConversion(actions, 'https://app.raydium.io/swap');
    assertTrue(result.canConvert, 'swap actions can convert');
    assertEqual(result.suggestion.type, 'solanaJupiterSwap');

    var noSubmit = p.suggestApiConversion(
      [{ type: 'type', selectors: ['swap-input-amount'], value: '100' }],
      'https://app.raydium.io/swap'
    );
    assertFalse(noSubmit.canConvert, 'no submit → cannot convert');

    var unknownUrl = p.suggestApiConversion(actions, 'https://example.com');
    assertFalse(unknownUrl.canConvert, 'unknown URL → cannot convert');
  }

  /* ── New DeFi pattern tests (expanded) ── */

  function testDefiNewPatternsMatchUrl() {
    var p = global.__CFS_DEFI_ACTION_PATTERNS;
    if (!p || typeof p.matchUrl !== 'function') return;

    var pumpfun = p.matchUrl('https://pump.fun/coin/ABC123mint');
    assertTrue(pumpfun.length > 0, 'pump.fun coin URL matches');
    assertTrue(pumpfun.some(function (m) { return m.id === 'pumpfun-buy' || m.id === 'pumpfun-sell'; }), 'pump.fun pattern id present');

    var clmmSwap = p.matchUrl('https://app.raydium.io/clmm/swap/poolId');
    assertTrue(clmmSwap.length > 0, 'raydium CLMM swap URL matches');

    var meteoraCpamm = p.matchUrl('https://app.meteora.ag/pools/some-pool');
    assertTrue(meteoraCpamm.length > 0, 'meteora CP-AMM URL matches');

    var oneInch = p.matchUrl('https://app.1inch.io/#/56/swap');
    assertTrue(oneInch.length > 0, '1inch URL matches');
    assertEqual(oneInch[0].chain, 'bsc', '1inch → bsc chain');

    var paraswap = p.matchUrl('https://app.paraswap.io/swap');
    assertTrue(paraswap.length > 0, 'paraswap URL matches');

    var aster = p.matchUrl('https://asterdex.com/futures/BTCUSDT');
    assertTrue(aster.length > 0, 'aster futures URL matches');

    var phantom = p.matchUrl('https://phantom.app/transfer');
    assertTrue(phantom.length > 0, 'phantom URL matches');
  }

  function testDefiAutoReplaceFlag() {
    var p = global.__CFS_DEFI_ACTION_PATTERNS;
    if (!p) return;
    for (var i = 0; i < p.patterns.length; i++) {
      assertTrue(p.patterns[i].autoReplace === true, p.patterns[i].id + ' has autoReplace: true');
    }
  }

  function testDefiSuggestApiConversionAutoReplace() {
    var p = global.__CFS_DEFI_ACTION_PATTERNS;
    if (!p || typeof p.suggestApiConversion !== 'function') return;
    var actions = [
      { type: 'type', selectors: ['buy-amount'], value: '100000000' },
      { type: 'click', selectors: ['buy-button'] },
    ];
    var result = p.suggestApiConversion(actions, 'https://pump.fun/coin/ABC');
    assertTrue(result.canConvert, 'pump.fun can convert');
    assertTrue(result.autoReplace === true, 'pump.fun autoReplace is true');
    assertEqual(result.suggestion.type, 'solanaPumpOrJupiterBuy', 'maps to pumpOrJupiterBuy');
  }

  /* ── Social pattern tests ── */

  function testSocialPatternsMatchUrl() {
    var p = global.__CFS_SOCIAL_ACTION_PATTERNS;
    if (!p || typeof p.matchUrl !== 'function') return;

    var tiktok = p.matchUrl('https://creator.tiktok.com/upload');
    assertTrue(tiktok.length > 0, 'TikTok creator URL matches');
    assertEqual(tiktok[0].platform, 'tiktok', 'platform is tiktok');

    var youtube = p.matchUrl('https://studio.youtube.com/video/upload');
    assertTrue(youtube.length > 0, 'YouTube Studio URL matches');
    assertEqual(youtube[0].platform, 'youtube');

    var igDm = p.matchUrl('https://instagram.com/direct/inbox');
    assertTrue(igDm.length > 0, 'Instagram DM URL matches');
    assertEqual(igDm[0].id, 'instagram-dm');

    var igComment = p.matchUrl('https://instagram.com/p/ABC123/');
    assertTrue(igComment.length > 0, 'Instagram post URL matches');
    assertEqual(igComment[0].id, 'instagram-comment-reply');

    var reddit = p.matchUrl('https://reddit.com/submit');
    assertTrue(reddit.length > 0, 'Reddit submit URL matches');

    var linkedin = p.matchUrl('https://linkedin.com/feed/share');
    assertTrue(linkedin.length > 0, 'LinkedIn URL matches');

    var bsky = p.matchUrl('https://bsky.app/compose');
    assertTrue(bsky.length > 0, 'Bluesky URL matches');

    var noMatch = p.matchUrl('https://google.com');
    assertEqual(noMatch.length, 0, 'non-social URL returns empty');
  }

  function testSocialAutoReplace() {
    var p = global.__CFS_SOCIAL_ACTION_PATTERNS;
    if (!p) return;
    for (var i = 0; i < p.patterns.length; i++) {
      assertTrue(p.patterns[i].autoReplace === true, p.patterns[i].id + ' has autoReplace: true');
    }
  }

  function testSocialSuggestApiConversion() {
    var p = global.__CFS_SOCIAL_ACTION_PATTERNS;
    if (!p || typeof p.suggestApiConversion !== 'function') return;

    var actions = [
      { type: 'type', selectors: ['caption-input'], value: 'My TikTok video' },
      { type: 'click', selectors: ['post-button'] },
    ];
    var result = p.suggestApiConversion(actions, 'https://creator.tiktok.com/upload');
    assertTrue(result.canConvert, 'TikTok can convert');
    assertTrue(result.autoReplace === true, 'TikTok autoReplace');
    assertEqual(result.suggestion.type, 'uploadPost', 'maps to uploadPost');
    assertEqual(result.suggestion.platformDefault, 'tiktok', 'defaults applied');
  }

  /* ── Data pattern tests ── */

  function testDataPatternsMatchUrl() {
    var p = global.__CFS_DATA_ACTION_PATTERNS;
    if (!p || typeof p.matchUrl !== 'function') return;

    var apifyConsole = p.matchUrl('https://console.apify.com/actors/abc123');
    assertTrue(apifyConsole.length > 0, 'Apify console URL matches');
    assertEqual(apifyConsole[0].platform, 'apify');

    var apifyStore = p.matchUrl('https://apify.com/store/web-scraper');
    assertTrue(apifyStore.length > 0, 'Apify store URL matches');

    var noMatch = p.matchUrl('https://google.com');
    assertEqual(noMatch.length, 0, 'non-data URL returns empty');
  }

  function testDataAutoReplaceFalse() {
    var p = global.__CFS_DATA_ACTION_PATTERNS;
    if (!p) return;
    for (var i = 0; i < p.patterns.length; i++) {
      assertTrue(p.patterns[i].autoReplace === false, p.patterns[i].id + ' has autoReplace: false');
    }
  }

  function testDataSuggestApiConversion() {
    var p = global.__CFS_DATA_ACTION_PATTERNS;
    if (!p || typeof p.suggestApiConversion !== 'function') return;
    var actions = [
      { type: 'type', selectors: ['json-editor-input'], value: '{"url":"https://example.com"}' },
      { type: 'click', selectors: ['run-button'] },
    ];
    var result = p.suggestApiConversion(actions, 'https://console.apify.com/actors/myactor');
    assertTrue(result.canConvert, 'Apify can convert');
    assertFalse(result.autoReplace, 'Apify autoReplace is false');
    assertEqual(result.suggestion.type, 'apifyActorRun', 'maps to apifyActorRun');
  }

  /* ── Unified registry tests ── */

  function testRegistryMatchUrl() {
    var r = global.__CFS_ACTION_PATTERNS;
    if (!r || typeof r.matchUrl !== 'function') return;

    /* DeFi match */
    var raydium = r.matchUrl('https://app.raydium.io/swap');
    assertTrue(raydium.length > 0, 'registry: raydium URL matches');

    /* Social match */
    var tiktok = r.matchUrl('https://creator.tiktok.com/upload');
    assertTrue(tiktok.length > 0, 'registry: TikTok URL matches');

    /* Data match */
    var apify = r.matchUrl('https://console.apify.com/actors/test');
    assertTrue(apify.length > 0, 'registry: Apify URL matches');

    /* No match */
    var no = r.matchUrl('https://example.com');
    assertEqual(no.length, 0, 'registry: unknown URL returns empty');
  }

  function testRegistryMatchSelector() {
    var r = global.__CFS_ACTION_PATTERNS;
    if (!r || typeof r.matchSelector !== 'function') return;

    var defi = r.matchSelector('https://app.raydium.io/swap', 'swap-input-amount');
    assertTrue(defi !== null, 'registry: DeFi selector match');

    var social = r.matchSelector('https://creator.tiktok.com/upload', 'post-button');
    assertTrue(social !== null, 'registry: social selector match');

    var data = r.matchSelector('https://console.apify.com/actors/test', 'run-button');
    assertTrue(data !== null, 'registry: data selector match');
    assertFalse(data.autoReplace, 'registry: data selector has autoReplace false');
  }

  function testRegistrySuggestApiConversion() {
    var r = global.__CFS_ACTION_PATTERNS;
    if (!r || typeof r.suggestApiConversion !== 'function') return;

    /* DeFi auto-replace */
    var defiResult = r.suggestApiConversion(
      [{ type: 'type', selectors: ['swap-input-amount'], value: '100' }, { type: 'click', selectors: ['swap-button'] }],
      'https://app.raydium.io/swap'
    );
    assertTrue(defiResult.canConvert, 'registry: DeFi can convert');
    assertTrue(defiResult.autoReplace, 'registry: DeFi autoReplace true');

    /* Apify suggest only */
    var apifyResult = r.suggestApiConversion(
      [{ type: 'type', selectors: ['json-editor-input'], value: '{}' }, { type: 'click', selectors: ['run-button'] }],
      'https://console.apify.com/actors/test'
    );
    assertTrue(apifyResult.canConvert, 'registry: Apify can convert');
    assertFalse(apifyResult.autoReplace, 'registry: Apify autoReplace false');
  }

  function testRegistryReplaceActionsWithApiSteps() {
    var r = global.__CFS_ACTION_PATTERNS;
    if (!r || typeof r.replaceActionsWithApiSteps !== 'function') return;

    /* DeFi auto-replace: clicks on a Raydium swap */
    var actions = [
      { type: 'type', selectors: ['swap-input-amount'], value: '1000000' },
      { type: 'click', selectors: ['swap-button'] },
      { type: 'walletApprove' },
    ];
    var result = r.replaceActionsWithApiSteps(actions, 'https://app.raydium.io/swap');
    assertTrue(result.replacements.length > 0, 'auto-replace: has replacements');
    assertTrue(result.actions.length < actions.length, 'auto-replace: action count reduced');
    var apiStep = result.actions.find(function (a) { return a._autoReplaced; });
    assertTrue(apiStep !== undefined, 'auto-replace: API step inserted');
    assertEqual(apiStep.type, 'solanaJupiterSwap', 'auto-replace: correct step type');
    assertTrue(apiStep._replacedFrom.length > 0, 'auto-replace: _replacedFrom set');

    /* Apify: no auto-replace */
    var apifyActions = [
      { type: 'type', selectors: ['json-editor-input'], value: '{}' },
      { type: 'click', selectors: ['run-button'] },
    ];
    var apifyResult = r.replaceActionsWithApiSteps(apifyActions, 'https://console.apify.com/actors/test');
    assertEqual(apifyResult.replacements.length, 0, 'no auto-replace for Apify');
    assertEqual(apifyResult.actions.length, 2, 'Apify actions unchanged');

    /* Empty/null inputs */
    var emptyResult = r.replaceActionsWithApiSteps([], 'https://app.raydium.io/swap');
    assertEqual(emptyResult.replacements.length, 0, 'empty actions → no replacements');
    var nullResult = r.replaceActionsWithApiSteps(null, 'https://app.raydium.io/swap');
    assertEqual(nullResult.replacements.length, 0, 'null actions → no replacements');

    /* Social auto-replace: TikTok upload */
    var socialActions = [
      { type: 'type', selectors: ['caption-input'], value: 'My video' },
      { type: 'click', selectors: ['post-button'] },
    ];
    var socialResult = r.replaceActionsWithApiSteps(socialActions, 'https://creator.tiktok.com/upload');
    assertTrue(socialResult.replacements.length > 0, 'social auto-replace: has replacements');
    var socialApiStep = socialResult.actions.find(function (a) { return a._autoReplaced; });
    assertTrue(socialApiStep !== undefined, 'social auto-replace: API step inserted');
    assertEqual(socialApiStep.type, 'uploadPost', 'social auto-replace: maps to uploadPost');
    assertEqual(socialApiStep.platformDefault, 'tiktok', 'social auto-replace: platform default set');
  }

  /* ── Recorder pattern hint detection tests ── */

  function testRecorderPatternHintDetection() {
    /* Inline from recorder.js — lightweight URL matcher */
    var _CFS_PATTERN_HINT_URLS = [
      { re: /app\.raydium\.io/i, platform: 'Raydium', category: 'defi' },
      { re: /jup\.ag/i, platform: 'Jupiter', category: 'defi' },
      { re: /pump\.fun/i, platform: 'Pump.fun', category: 'defi' },
      { re: /app\.meteora\.ag/i, platform: 'Meteora', category: 'defi' },
      { re: /pancakeswap\.finance/i, platform: 'PancakeSwap', category: 'defi' },
      { re: /app\.1inch\.io/i, platform: '1inch', category: 'defi' },
      { re: /asterdex\.com/i, platform: 'Aster', category: 'defi' },
      { re: /creator\.tiktok\.com|tiktok\.com\/creator/i, platform: 'TikTok', category: 'social' },
      { re: /studio\.youtube\.com/i, platform: 'YouTube', category: 'social' },
      { re: /instagram\.com\/(create|reels|direct|p\/|reel\/|accounts)/i, platform: 'Instagram', category: 'social' },
      { re: /reddit\.com\/(submit|r\/.*\/submit)/i, platform: 'Reddit', category: 'social' },
      { re: /bsky\.app/i, platform: 'Bluesky', category: 'social' },
      { re: /console\.apify\.com\/actors?\//i, platform: 'Apify', category: 'data' },
    ];
    function detectPatternHint(url) {
      if (!url) return null;
      for (var i = 0; i < _CFS_PATTERN_HINT_URLS.length; i++) {
        if (_CFS_PATTERN_HINT_URLS[i].re.test(url)) {
          return { platform: _CFS_PATTERN_HINT_URLS[i].platform, category: _CFS_PATTERN_HINT_URLS[i].category };
        }
      }
      return null;
    }

    var raydium = detectPatternHint('https://app.raydium.io/swap');
    assertTrue(raydium !== null, 'hint: raydium detected');
    assertEqual(raydium.platform, 'Raydium');
    assertEqual(raydium.category, 'defi');

    var pump = detectPatternHint('https://pump.fun/coin/ABC');
    assertTrue(pump !== null, 'hint: pump.fun detected');
    assertEqual(pump.platform, 'Pump.fun');

    var tiktok = detectPatternHint('https://creator.tiktok.com/upload');
    assertTrue(tiktok !== null, 'hint: tiktok detected');
    assertEqual(tiktok.category, 'social');

    var ig = detectPatternHint('https://instagram.com/direct/inbox');
    assertTrue(ig !== null, 'hint: instagram dm detected');
    assertEqual(ig.platform, 'Instagram');

    var reddit = detectPatternHint('https://reddit.com/r/test/submit');
    assertTrue(reddit !== null, 'hint: reddit submit detected');

    var apify = detectPatternHint('https://console.apify.com/actors/test123');
    assertTrue(apify !== null, 'hint: apify detected');
    assertEqual(apify.category, 'data');

    var noMatch = detectPatternHint('https://google.com');
    assertEqual(noMatch, null, 'hint: no match for google');

    var empty = detectPatternHint('');
    assertEqual(empty, null, 'hint: empty url');

    var nullUrl = detectPatternHint(null);
    assertEqual(nullUrl, null, 'hint: null url');
  }

  /* ── walletApprove annotation after auto-replace tests ── */

  function testRegistryWalletApproveAnnotation() {
    var r = global.__CFS_ACTION_PATTERNS;
    if (!r || typeof r.replaceActionsWithApiSteps !== 'function') return;

    /* Simulate a workflow with DeFi actions followed by walletApprove */
    var actions = [
      { type: 'type', selectors: ['swap-input-amount'], value: '500000' },
      { type: 'click', selectors: ['swap-button'] },
      { type: 'walletApprove' },
    ];
    var result = r.replaceActionsWithApiSteps(actions, 'https://app.raydium.io/swap');
    assertTrue(result.replacements.length > 0, 'walletApprove test: has replacements');

    /* The walletApprove step should still be in the actions (not replaced itself) */
    var apiStep = result.actions.find(function (a) { return a._autoReplaced; });
    assertTrue(apiStep !== undefined, 'walletApprove test: API step present');

    /* Verify the walletApprove was absorbed into the replaced sequence
       (it follows the submit in the matched indices) */
    assertTrue(result.actions.length <= 2, 'walletApprove test: actions consolidated');
  }

  /* ── DeFi field hints merge tests ── */

  function testDefiFieldHintsMerge() {
    var r = global.__CFS_ACTION_PATTERNS;
    if (!r || typeof r.replaceActionsWithApiSteps !== 'function') return;

    /* Simulate actions with _defiFieldHints attached (as recorder would) */
    var actions = [
      {
        type: 'type', selectors: ['swap-input-amount'], value: '500000',
        _defiFieldHints: { poolId: 'POOL123ABC', tokenA: 'SOL', tokenB: 'USDC', amountIn: '0.5' },
      },
      { type: 'click', selectors: ['swap-button'] },
      { type: 'walletApprove' },
    ];
    var result = r.replaceActionsWithApiSteps(actions, 'https://app.raydium.io/swap');
    assertTrue(result.replacements.length > 0, 'fieldHints merge: has replacements');
    var apiStep = result.actions.find(function (a) { return a._autoReplaced; });
    assertTrue(apiStep !== undefined, 'fieldHints merge: API step exists');
    /* Verify field hints were carried into the API step */
    assertTrue(apiStep._defiFieldHints !== undefined, 'fieldHints merge: _defiFieldHints present');
    assertEqual(apiStep._defiFieldHints.poolId, 'POOL123ABC', 'fieldHints merge: poolId carried');
    assertEqual(apiStep.poolId, 'POOL123ABC', 'fieldHints merge: poolId on step');
    assertEqual(apiStep.tokenA, 'SOL', 'fieldHints merge: tokenA on step');
    assertEqual(apiStep.tokenB, 'USDC', 'fieldHints merge: tokenB on step');
    assertEqual(apiStep.amountIn, '0.5', 'fieldHints merge: amountIn on step');
  }

  /* ── DeFi field hint URL extraction mock test ── */

  function testDefiFieldHintUrlExtraction() {
    /* Test the URL path extraction logic (same as in recorder.js _cfsExtractDefiFieldHints) */
    function extractUrlHints(platform, url) {
      var hints = {};
      try {
        var pathname = new URL(url).pathname;
        if (platform === 'Pump.fun') {
          var coinMatch = pathname.match(/\/coin\/([A-Za-z0-9]{32,})/);
          if (coinMatch) hints.mint = coinMatch[1];
        }
        if (platform === 'Raydium') {
          var poolMatch = pathname.match(/\/(swap|liquidity|clmm)\/([A-Za-z0-9]{20,})/);
          if (poolMatch) hints.poolId = poolMatch[2];
        }
        if (platform === 'Meteora') {
          var meteoraMatch = pathname.match(/\/(pools?|dlmm)\/([A-Za-z0-9]{20,})/);
          if (meteoraMatch) hints.poolId = meteoraMatch[2];
        }
      } catch (_) {}
      return Object.keys(hints).length > 0 ? hints : null;
    }

    /* Pump.fun mint extraction */
    var pump = extractUrlHints('Pump.fun', 'https://pump.fun/coin/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
    assertTrue(pump !== null, 'urlHints: pump.fun has hints');
    assertEqual(pump.mint, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'urlHints: pump.fun mint extracted');

    /* Raydium pool ID extraction */
    var raydium = extractUrlHints('Raydium', 'https://app.raydium.io/swap/3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1');
    assertTrue(raydium !== null, 'urlHints: raydium has hints');
    assertEqual(raydium.poolId, '3ne4mWqdYuNiYrYZC9TrA3FcfuFdErghH97vNPbjicr1', 'urlHints: raydium poolId extracted');

    /* Raydium CLMM pool */
    var raydiumClmm = extractUrlHints('Raydium', 'https://app.raydium.io/clmm/ABC12345678901234567890');
    assertTrue(raydiumClmm !== null, 'urlHints: raydium CLMM has hints');
    assertEqual(raydiumClmm.poolId, 'ABC12345678901234567890', 'urlHints: raydium CLMM poolId');

    /* Meteora pool */
    var meteora = extractUrlHints('Meteora', 'https://app.meteora.ag/pools/METEORApool1234567890123456');
    assertTrue(meteora !== null, 'urlHints: meteora has hints');
    assertEqual(meteora.poolId, 'METEORApool1234567890123456', 'urlHints: meteora poolId');

    /* No hint for basic swap page */
    var noHint = extractUrlHints('Raydium', 'https://app.raydium.io/swap');
    assertEqual(noHint, null, 'urlHints: no poolId for basic swap page');

    /* Short mint shouldn't match (< 32 chars for Pump) */
    var shortMint = extractUrlHints('Pump.fun', 'https://pump.fun/coin/shortmint');
    assertEqual(shortMint, null, 'urlHints: short pump mint no match');
  }

  /* ── Fallback actions preservation tests ── */

  function testFallbackActionsPreserved() {
    var r = global.__CFS_ACTION_PATTERNS;
    if (!r || typeof r.replaceActionsWithApiSteps !== 'function') return;

    var actions = [
      { type: 'type', selectors: ['swap-input-amount'], value: '1000000', url: 'https://app.raydium.io/swap/POOL123' },
      { type: 'click', selectors: ['swap-button'], url: 'https://app.raydium.io/swap/POOL123' },
      { type: 'walletApprove', url: 'https://app.raydium.io/swap/POOL123' },
    ];
    var result = r.replaceActionsWithApiSteps(actions, 'https://app.raydium.io/swap');
    assertTrue(result.replacements.length > 0, 'fallback: has replacements');
    var apiStep = result.actions.find(function (a) { return a._autoReplaced; });
    assertTrue(apiStep !== undefined, 'fallback: API step exists');

    /* _fallbackActions preserved */
    assertTrue(Array.isArray(apiStep._fallbackActions), 'fallback: _fallbackActions is array');
    assertTrue(apiStep._fallbackActions.length >= 2, 'fallback: has at least 2 fallback actions');
    assertEqual(apiStep._fallbackActions[0].type, 'type', 'fallback: first fallback is type');
    assertEqual(apiStep._fallbackActions[1].type, 'click', 'fallback: second fallback is click');

    /* _fallbackStartUrl uses action's URL */
    assertEqual(apiStep._fallbackStartUrl, 'https://app.raydium.io/swap/POOL123', 'fallback: _fallbackStartUrl from action URL');

    /* fallbackMode defaults to auto */
    assertEqual(apiStep.fallbackMode, 'auto', 'fallback: fallbackMode defaults to auto');

    /* Fallback actions are deep copies (not references) */
    apiStep._fallbackActions[0].selectors = ['modified'];
    assertEqual(actions[0].selectors[0], 'swap-input-amount', 'fallback: deep copy, original not mutated');
  }

  /* ── Fallback eligibility pattern matching tests ── */

  function testFallbackEligibilityPatterns() {
    /* Inline the same patterns from player.js for testability */
    var ELIGIBLE = [
      /wallet.*not\s*(configured|found|set)/i,
      /no\s*(solana|bsc|evm)\s*wallet/i,
      /api\s*key\s*(not|missing|invalid|required)/i,
      /unauthorized|token\s*expired|auth.*fail/i,
      /rate\s*limit|too\s*many\s*requests|429/i,
      /network\s*error|econnrefused|fetch\s*fail|503|502|504/i,
      /backend.*unreachable|api.*down|service.*unavailable/i,
      /credits?\s*(exhausted|insufficient|expired|ran\s*out)/i,
      /required\s*field.*empty/i,
      /profile.*not\s*found|no\s*upload.*profile/i,
    ];
    var EXCLUDE = [
      /insufficient\s*(sol|bnb|funds|balance)/i,
      /simulation\s*fail/i,
      /transaction\s*fail/i,
      /slippage/i,
      /tab.*closed|disconnected/i,
    ];
    function isEligible(msg) {
      for (var i = 0; i < EXCLUDE.length; i++) { if (EXCLUDE[i].test(msg)) return false; }
      for (var j = 0; j < ELIGIBLE.length; j++) { if (ELIGIBLE[j].test(msg)) return true; }
      return false;
    }

    /* Should trigger fallback */
    assertTrue(isEligible('Wallet not configured for Solana'), 'fbEligible: wallet not configured');
    assertTrue(isEligible('No Solana wallet set up'), 'fbEligible: no solana wallet');
    assertTrue(isEligible('API key not found'), 'fbEligible: api key not found');
    assertTrue(isEligible('API key missing'), 'fbEligible: api key missing');
    assertTrue(isEligible('Unauthorized'), 'fbEligible: unauthorized');
    assertTrue(isEligible('Token expired'), 'fbEligible: token expired');
    assertTrue(isEligible('Rate limit exceeded'), 'fbEligible: rate limit');
    assertTrue(isEligible('HTTP 429 Too Many Requests'), 'fbEligible: 429');
    assertTrue(isEligible('Network error: ECONNREFUSED'), 'fbEligible: network error');
    assertTrue(isEligible('503 Service Unavailable'), 'fbEligible: 503');
    assertTrue(isEligible('Backend unreachable'), 'fbEligible: backend unreachable');
    assertTrue(isEligible('Credits exhausted'), 'fbEligible: credits exhausted');
    assertTrue(isEligible('Required field "mint" is empty'), 'fbEligible: required field empty');
    assertTrue(isEligible('Upload profile not found'), 'fbEligible: profile not found');
    assertTrue(isEligible('No BSC wallet configured'), 'fbEligible: no bsc wallet');
    assertTrue(isEligible('Auth failed for API'), 'fbEligible: auth failed');

    /* Should NOT trigger fallback */
    assertTrue(!isEligible('Insufficient SOL for transaction'), 'fbNotEligible: insufficient sol');
    assertTrue(!isEligible('Insufficient BNB balance'), 'fbNotEligible: insufficient bnb');
    assertTrue(!isEligible('Simulation failed: program error'), 'fbNotEligible: simulation fail');
    assertTrue(!isEligible('Transaction failed'), 'fbNotEligible: transaction fail');
    assertTrue(!isEligible('Slippage tolerance exceeded'), 'fbNotEligible: slippage');
    assertTrue(!isEligible('Tab closed during playback'), 'fbNotEligible: tab closed');
    assertTrue(!isEligible('Element not found'), 'fbNotEligible: generic element error');
  }

  /* ── Playback guard tests (require extension context) ── */

  function testPlaybackGuardIsPlaybackActiveReturns() {
    if (!global.chrome || !global.chrome.runtime || !global.chrome.runtime.sendMessage) return;
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ type: 'CFS_IS_PLAYBACK_ACTIVE' }, function (resp) {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        try {
          assertTrue(resp !== undefined && resp !== null, 'CFS_IS_PLAYBACK_ACTIVE returns a response');
          assertTrue(typeof resp.active === 'boolean', 'response.active is boolean');
          resolve();
        } catch (e) { reject(e); }
      });
    });
  }

  function testPlaybackGuardEnsureBlockedWhenBusy() {
    if (!global.chrome || !global.chrome.runtime || !global.chrome.runtime.sendMessage) return;
    /* We cannot reliably make playback active in a unit test, so we verify
       the shape of the response: when force is omitted and playback is idle,
       the ensure call should NOT have playbackBlocked set. */
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        { type: 'CFS_IS_PLAYBACK_ACTIVE' },
        function (statusResp) {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          try {
            /* If playback IS active for some reason, skip (we can't control it in unit tests) */
            if (statusResp && statusResp.active) {
              assertTrue(true, 'playback is active — skipped (cannot control in unit test)');
              resolve();
              return;
            }
            /* Playback idle → ensure should proceed, not be blocked */
            chrome.runtime.sendMessage(
              { type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS', skipFund: true },
              function (ensureResp) {
                if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                try {
                  assertFalse(
                    ensureResp && ensureResp.playbackBlocked === true,
                    'ensure is NOT blocked when playback is idle',
                  );
                  resolve();
                } catch (e2) { reject(e2); }
              },
            );
          } catch (e) { reject(e); }
        },
      );
    });
  }

  function testPlaybackGuardForceBypass() {
    if (!global.chrome || !global.chrome.runtime || !global.chrome.runtime.sendMessage) return;
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        { type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS', force: true, skipFund: true },
        function (resp) {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          try {
            assertFalse(
              resp && resp.playbackBlocked === true,
              'force: true always bypasses playback guard',
            );
            resolve();
          } catch (e) { reject(e); }
        },
      );
    });
  }

  /* ── Inline test calls ── */
  testDefiActionPatternsMatchUrl();
  testDefiActionPatternsMatchSelector();
  testDefiActionPatternsSuggestApiConversion();
  testDefiNewPatternsMatchUrl();
  testDefiAutoReplaceFlag();
  testDefiSuggestApiConversionAutoReplace();
  testSocialPatternsMatchUrl();
  testSocialAutoReplace();
  testSocialSuggestApiConversion();
  testDataPatternsMatchUrl();
  testDataAutoReplaceFalse();
  testDataSuggestApiConversion();
  testRegistryMatchUrl();
  testRegistryMatchSelector();
  testRegistrySuggestApiConversion();
  testRegistryReplaceActionsWithApiSteps();
  testRecorderPatternHintDetection();
  testRegistryWalletApproveAnnotation();
  testDefiFieldHintsMerge();
  testDefiFieldHintUrlExtraction();
  testFallbackActionsPreserved();
  testFallbackEligibilityPatterns();

  /** Generator template inputSchema (__CFS_INPUT_SCHEMA) */
  function testGeneratorTemplateSchemaParseFromObject() {
    var api = global.__CFS_parseGeneratorTemplateInputSchema;
    if (!api) throw new Error('__CFS_parseGeneratorTemplateInputSchema not loaded');
    var o = {
      merge: [{ find: '__CFS_INPUT_SCHEMA', replace: '[{"id":"headline","label":"Headline","mergeField":"TITLE"}]' }],
    };
    var r = api.parseFromTemplateObject(o);
    assertEqual(r.error, null);
    assertEqual(r.inputSchema.length, 1);
    assertEqual(r.inputSchema[0].id, 'headline');
  }

  function testGeneratorTemplateSchemaParseInvalidJson() {
    var api = global.__CFS_parseGeneratorTemplateInputSchema;
    var r = api.parseFromTemplateJsonText('{');
    assertTrue(r.error != null && r.error.length > 0);
    assertEqual(r.inputSchema.length, 0);
  }

  function testGeneratorTemplateSchemaSuggestValue() {
    var api = global.__CFS_parseGeneratorTemplateInputSchema;
    assertEqual(api.suggestInputMapValue({ id: 'x', mergeField: 'TITLE' }, ''), '{{TITLE}}');
    assertEqual(api.suggestInputMapValue({ id: 'headline' }, ''), '{{headline}}');
    assertEqual(api.suggestInputMapValue({ id: 'headline' }, '{{custom}}'), '{{custom}}');
  }

  testGeneratorTemplateSchemaParseFromObject();
  testGeneratorTemplateSchemaParseInvalidJson();
  testGeneratorTemplateSchemaSuggestValue();

})(typeof window !== 'undefined' ? window : globalThis);

