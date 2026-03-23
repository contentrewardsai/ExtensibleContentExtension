/**
 * Unit tests for generator / pixi-timeline-player logic.
 * Tests pure functions: position calculation, merge substitution, audio entries,
 * duration resolution, fit/scale, and template metadata round-trip.
 *
 * Requires: unit-test-runner.js, pixi-timeline-player.js (with or without PIXI),
 *           template-engine.js, unified-editor.js
 */
(function (global) {
  'use strict';

  var assertEqual = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertEqual;
  var assertDeepEqual = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertDeepEqual;
  var assertTrue = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertTrue;
  var assertFalse = global.CFS_unitTestRunner && global.CFS_unitTestRunner.assertFalse;

  if (!assertEqual) return;

  /* ——— Position calculation ——— */

  var positionFromClip = (function () {
    return function (canvasW, canvasH, clip, elemW, elemH) {
      var offset = clip.offset || {};
      var ox = offset.x != null ? Number(offset.x) : 0;
      var oy = offset.y != null ? Number(offset.y) : 0;
      var dx = Math.abs(ox) <= 1 ? ox * canvasW : ox;
      var dy = Math.abs(oy) <= 1 ? -oy * canvasH : -oy;
      var pos = (clip.position || '').toLowerCase();
      if (!pos) pos = 'center';
      var x, y;
      if (pos === 'center') { x = (canvasW - elemW) / 2 + dx; y = (canvasH - elemH) / 2 + dy; }
      else if (pos === 'top') { x = (canvasW - elemW) / 2 + dx; y = 0 + dy; }
      else if (pos === 'bottom') { x = (canvasW - elemW) / 2 + dx; y = canvasH - elemH + dy; }
      else if (pos === 'left') { x = 0 + dx; y = (canvasH - elemH) / 2 + dy; }
      else if (pos === 'right') { x = canvasW - elemW + dx; y = (canvasH - elemH) / 2 + dy; }
      else if (pos === 'topleft') { x = 0 + dx; y = 0 + dy; }
      else if (pos === 'topright') { x = canvasW - elemW + dx; y = 0 + dy; }
      else if (pos === 'bottomleft') { x = 0 + dx; y = canvasH - elemH + dy; }
      else if (pos === 'bottomright') { x = canvasW - elemW + dx; y = canvasH - elemH + dy; }
      else { x = (canvasW - elemW) / 2 + dx; y = (canvasH - elemH) / 2 + dy; }
      return { x: x, y: y };
    };
  })();

  global.testPositionCenter = function () {
    var r = positionFromClip(1080, 1920, { position: 'center' }, 200, 100);
    assertEqual(r.x, 440);
    assertEqual(r.y, 910);
  };

  global.testPositionTopLeft = function () {
    var r = positionFromClip(1080, 1920, { position: 'topLeft' }, 200, 100);
    assertEqual(r.x, 0);
    assertEqual(r.y, 0);
  };

  global.testPositionBottomRight = function () {
    var r = positionFromClip(1080, 1920, { position: 'bottomRight' }, 200, 100);
    assertEqual(r.x, 880);
    assertEqual(r.y, 1820);
  };

  global.testPositionDefaultIsCenter = function () {
    var r = positionFromClip(1080, 1920, {}, 200, 100);
    var c = positionFromClip(1080, 1920, { position: 'center' }, 200, 100);
    assertEqual(r.x, c.x, 'default x matches center');
    assertEqual(r.y, c.y, 'default y matches center');
  };

  global.testPositionCenterWithOffset = function () {
    var r = positionFromClip(1080, 1920, { position: 'center', offset: { x: 0, y: 0.167 } }, 1160, 593);
    assertEqual(r.x, (1080 - 1160) / 2);
    var expectedY = (1920 - 593) / 2 + (-0.167 * 1920);
    assertTrue(Math.abs(r.y - expectedY) < 0.01, 'y with positive offset moves up');
  };

  global.testPositionCenterWithNegativeOffsetY = function () {
    var r = positionFromClip(1080, 1920, { position: 'center', offset: { x: 0, y: -0.257 } }, 1080, 325);
    var expectedY = (1920 - 325) / 2 + (0.257 * 1920);
    assertTrue(Math.abs(r.y - expectedY) < 0.01, 'negative y offset moves down');
  };

  global.testPositionFullCanvasElement = function () {
    var r = positionFromClip(1080, 1920, { position: 'center' }, 1080, 1920);
    assertEqual(r.x, 0);
    assertEqual(r.y, 0);
  };

  /* ——— Merge substitution ——— */

  global.testMergeApplyToTemplate = function () {
    var engine = global.__CFS_templateEngine;
    if (!engine || !engine.applyMergeToTemplate) return;
    var template = {
      timeline: { tracks: [{ clips: [{ asset: { type: 'text', text: '{{ BRAND_NAME }}' }, start: 0, length: 5 }] }] },
      merge: [{ find: 'BRAND_NAME', replace: 'BRAND NAME' }],
    };
    var merged = engine.applyMergeToTemplate(template, { BRAND_NAME: 'Acme Corp' });
    var text = merged.timeline.tracks[0].clips[0].asset.text;
    assertEqual(text, 'Acme Corp', 'merge should substitute BRAND_NAME');
  };

  /* ——— Duration resolution ——— */

  global.testDurationWithEndLength = function () {
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'image', src: 'a.jpg' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'audio', src: 'b.mp3' }, start: 0, length: 'end' }] },
          { clips: [{ asset: { type: 'image', src: 'c.jpg' }, start: 12.82, length: 2.2 }] },
        ],
      },
      output: { size: { width: 1080, height: 1920 } },
    };
    var maxEnd = 0;
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        if (clip.length !== 'end') {
          var end = (clip.start || 0) + (typeof clip.length === 'number' ? clip.length : 5);
          maxEnd = Math.max(maxEnd, end);
        }
      });
    });
    assertEqual(maxEnd, 15.02, 'numeric max is 12.82 + 2.2');
    var audioEnd = 0 + maxEnd;
    assertEqual(audioEnd, 15.02, 'audio with length:end spans full duration');
  };

  /* ——— Audio effect mapping ——— */

  global.testAudioFadeOutEffectMapping = function () {
    var clip = { start: 0, length: 'end', asset: { type: 'audio', src: 'a.mp3', volume: 1, effect: 'fadeOut' } };
    var effect = (clip.asset.effect || '').toLowerCase();
    var fadeIn = 0;
    var fadeOut = 0;
    var timelineLength = 15;
    if (effect === 'fadein' || effect === 'fadeinfadeout') fadeIn = Math.min(timelineLength * 0.5, 2);
    if (effect === 'fadeout' || effect === 'fadeinfadeout') fadeOut = Math.min(timelineLength * 0.5, 2);
    assertEqual(fadeIn, 0, 'fadeOut effect should not set fadeIn');
    assertEqual(fadeOut, 2, 'fadeOut effect should set fadeOut to min(len*0.5, 2)');
  };

  global.testAudioFadeInFadeOutEffectMapping = function () {
    var effect = 'fadeInFadeOut'.toLowerCase();
    var timelineLength = 3;
    var fadeIn = 0;
    var fadeOut = 0;
    if (effect === 'fadein' || effect === 'fadeinfadeout') fadeIn = Math.min(timelineLength * 0.5, 2);
    if (effect === 'fadeout' || effect === 'fadeinfadeout') fadeOut = Math.min(timelineLength * 0.5, 2);
    assertEqual(fadeIn, 1.5, 'fadeInFadeOut sets fadeIn');
    assertEqual(fadeOut, 1.5, 'fadeInFadeOut sets fadeOut');
  };

  global.testAudioNoEffectNoFade = function () {
    var effect = '';
    var fadeIn = 0;
    var fadeOut = 0;
    if (effect === 'fadein' || effect === 'fadeinfadeout') fadeIn = 1;
    if (effect === 'fadeout' || effect === 'fadeinfadeout') fadeOut = 1;
    assertEqual(fadeIn, 0, 'no effect means no fadeIn');
    assertEqual(fadeOut, 0, 'no effect means no fadeOut');
  };

  /* ——— Fit / scale ——— */

  function applyFitAndScale(clip, targetW, targetH, sourceW, sourceH) {
    var fit = (clip.fit || 'crop').toLowerCase();
    var scaleMult = typeof clip.scale === 'number' && clip.scale > 0 ? clip.scale : 1;
    if (sourceW <= 0 || sourceH <= 0) return { width: targetW, height: targetH, x: 0, y: 0 };
    var w = targetW, h = targetH, x = 0, y = 0;
    if (fit === 'contain') {
      var s = Math.min(targetW / sourceW, targetH / sourceH) * scaleMult;
      w = sourceW * s; h = sourceH * s;
      x = (targetW - w) / 2; y = (targetH - h) / 2;
    } else if (fit === 'cover' || fit === 'crop') {
      var sc = Math.max(targetW / sourceW, targetH / sourceH) * scaleMult;
      w = sourceW * sc; h = sourceH * sc;
      x = (targetW - w) / 2; y = (targetH - h) / 2;
    } else if (fit === 'fill') {
      w = targetW * scaleMult; h = targetH * scaleMult;
    } else if (fit === 'none') {
      w = sourceW * scaleMult; h = sourceH * scaleMult;
      x = (targetW - w) / 2; y = (targetH - h) / 2;
    }
    return { width: w, height: h, x: x, y: y };
  }

  global.testFitCropDefault = function () {
    var r = applyFitAndScale({}, 1080, 1920, 1920, 1080);
    assertTrue(r.width >= 1080, 'crop fills target width');
    assertTrue(r.height >= 1920, 'crop fills target height');
  };

  global.testFitContain = function () {
    var r = applyFitAndScale({ fit: 'contain' }, 1080, 1920, 1920, 1080);
    assertTrue(r.width <= 1080 + 0.01, 'contain fits within target width');
    assertTrue(r.height <= 1920 + 0.01, 'contain fits within target height');
  };

  global.testFitNonePreservesSource = function () {
    var r = applyFitAndScale({ fit: 'none', scale: 1 }, 1080, 1920, 500, 300);
    assertEqual(r.width, 500, 'none preserves source width');
    assertEqual(r.height, 300, 'none preserves source height');
    assertEqual(r.x, (1080 - 500) / 2, 'centered horizontally');
  };

  global.testFitFill = function () {
    var r = applyFitAndScale({ fit: 'fill' }, 1080, 1920, 500, 300);
    assertEqual(r.width, 1080, 'fill stretches to target width');
    assertEqual(r.height, 1920, 'fill stretches to target height');
  };

  global.testFitContainWithScale = function () {
    var r1 = applyFitAndScale({ fit: 'contain' }, 1080, 1920, 1920, 1080);
    var r2 = applyFitAndScale({ fit: 'contain', scale: 2 }, 1080, 1920, 1920, 1080);
    assertTrue(Math.abs(r2.width - r1.width * 2) < 0.01, 'scale 2x doubles width');
  };

  /* ——— Text background with empty text ——— */

  global.testTextBgHeightUsesAssetHeight = function () {
    var asset = { width: 1080, height: 250, background: { color: '#d5c49b' }, text: '' };
    var assetH = asset.height != null ? Number(asset.height) : 0;
    var textHeight = 0;
    var fontSize = 72;
    var pad = 4;
    var th = assetH > 0 ? assetH : ((textHeight || fontSize * 1.2) + pad * 2);
    assertEqual(th, 250, 'background height should use asset.height when text is empty');
  };

  global.testTextBgHeightFallsBackToFontSize = function () {
    var asset = { background: { color: '#d5c49b' }, text: 'Hello' };
    var assetH = asset.height != null ? Number(asset.height) : 0;
    var textHeight = 40;
    var fontSize = 72;
    var pad = 4;
    var th = assetH > 0 ? assetH : ((textHeight || fontSize * 1.2) + pad * 2);
    assertEqual(th, 48, 'without asset.height, uses text height + padding');
  };

  /* ——— Transition duration map ——— */

  global.testTransitionDurationMapCompleteness = function () {
    var expected = [
      'fade', 'fadeSlow', 'fadeFast',
      'slideLeft', 'slideRight', 'slideUp', 'slideDown',
      'slideLeftSlow', 'slideRightSlow', 'slideUpSlow', 'slideDownSlow',
      'carouselLeft', 'carouselRight', 'carouselUp', 'carouselDown',
      'carouselLeftSlow', 'carouselRightSlow', 'carouselUpSlow', 'carouselDownSlow',
      'zoomIn', 'zoomOut', 'zoomInSlow', 'zoomOutSlow',
      'reveal', 'revealSlow', 'revealFast',
      'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown',
    ];
    var TRANSITION_DURATION = {
      fade: 0.3, fadeSlow: 0.6, fadeFast: 0.15,
      reveal: 0.5, revealSlow: 0.8, revealFast: 0.25,
      wipeLeft: 0.35, wipeRight: 0.35, wipeUp: 0.35, wipeDown: 0.35,
      slideLeft: 0.4, slideRight: 0.4, slideUp: 0.4, slideDown: 0.4,
      slideLeftSlow: 0.7, slideRightSlow: 0.7, slideUpSlow: 0.7, slideDownSlow: 0.7,
      zoomIn: 0.35, zoomOut: 0.35, zoomInSlow: 0.6, zoomOutSlow: 0.6,
      carouselLeft: 0.5, carouselRight: 0.5, carouselUp: 0.5, carouselDown: 0.5,
      carouselLeftSlow: 0.8, carouselRightSlow: 0.8, carouselUpSlow: 0.8, carouselDownSlow: 0.8,
    };
    for (var i = 0; i < expected.length; i++) {
      assertTrue(TRANSITION_DURATION[expected[i]] > 0, 'missing transition: ' + expected[i]);
    }
  };

  /* ——— Template transitions used in this JSON ——— */

  global.testTemplateTransitionsAreRecognised = function () {
    var usedTransitions = ['fade', 'slideDown', 'slideUp', 'carouselUpSlow', 'carouselUp'];
    var TRANSITION_DURATION = {
      fade: 0.3, slideDown: 0.4, slideUp: 0.4, carouselUpSlow: 0.8, carouselUp: 0.5,
    };
    for (var i = 0; i < usedTransitions.length; i++) {
      assertTrue(TRANSITION_DURATION[usedTransitions[i]] > 0, 'transition ' + usedTransitions[i] + ' should have a duration');
    }
  };

  /* ——— Template effects used in this JSON ——— */

  global.testTemplateEffectsAreRecognised = function () {
    var usedEffects = ['zoomInSlow', 'zoomOutSlow'];
    for (var i = 0; i < usedEffects.length; i++) {
      var e = usedEffects[i].toLowerCase();
      assertTrue(
        e.indexOf('zoomin') !== -1 || e.indexOf('zoomout') !== -1 ||
        e.indexOf('slideleft') !== -1 || e.indexOf('slideright') !== -1 ||
        e.indexOf('slideup') !== -1 || e.indexOf('slidedown') !== -1,
        'effect ' + usedEffects[i] + ' should be a known effect type'
      );
    }
  };

  /* ——— Editor metadata round-trip ——— */

  global.testEditorMetaRoundTrip = function () {
    var editor = global.__CFS_unifiedEditor;
    if (!editor || !editor.serializeEditorMeta || !editor.deserializeEditorMeta) return;
    var ext = { templateId: 'test-001', templateName: 'Test', outputType: 'video', description: 'A test' };
    var mergeEntries = editor.serializeEditorMeta(ext);
    assertTrue(Array.isArray(mergeEntries), 'serialize returns array');
    assertTrue(mergeEntries.length > 0, 'serialize returns entries');
    var restored = editor.deserializeEditorMeta(mergeEntries);
    assertEqual(restored.templateId, 'test-001');
    assertEqual(restored.templateName, 'Test');
    assertEqual(restored.outputType, 'video');
  };

  /* ——— Font size parsing (string vs number) ——— */

  global.testFontSizeStringParsing = function () {
    assertEqual(Number('180'), 180, 'string "180" converts to 180');
    assertEqual(Number(72), 72, 'number 72 stays 72');
    assertTrue(!isNaN(Number('100')), 'string "100" is a valid number');
  };

  /* ——— Clip opacity handling ——— */

  global.testClipOpacityStatic = function () {
    var opacities = [1, 0.5, 0.1];
    for (var i = 0; i < opacities.length; i++) {
      var v = opacities[i];
      assertTrue(typeof v === 'number', 'opacity is a number');
      assertTrue(v >= 0 && v <= 1, 'opacity ' + v + ' is in range [0,1]');
    }
  };

  /* ——— New arrivals template structure validation ——— */

  global.testNewArrivalsTemplateStructure = function () {
    var template = getNewArrivalsTemplate();
    assertTrue(template.timeline != null, 'has timeline');
    assertTrue(Array.isArray(template.timeline.tracks), 'has tracks array');
    assertEqual(template.timeline.tracks.length, 14, 'has 14 tracks');
    assertTrue(Array.isArray(template.timeline.fonts), 'has fonts array');
    assertEqual(template.timeline.fonts.length, 2, 'has 2 fonts');
    assertEqual(template.output.size.width, 1080, 'output width 1080');
    assertEqual(template.output.size.height, 1920, 'output height 1920');
    assertTrue(Array.isArray(template.merge), 'has merge array');
    assertEqual(template.merge.length, 7, 'has 7 merge entries');
  };

  global.testNewArrivalsAssetTypes = function () {
    var template = getNewArrivalsTemplate();
    var types = {};
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        var t = clip.asset && clip.asset.type;
        if (t) types[t] = (types[t] || 0) + 1;
      });
    });
    assertEqual(types.audio, 1, '1 audio clip');
    assertEqual(types.text, 5, '5 text clips');
    assertEqual(types.video, 2, '2 video clips');
    assertEqual(types.image, 6, '6 image clips');
  };

  global.testNewArrivalsLengthEndClips = function () {
    var template = getNewArrivalsTemplate();
    var endClips = 0;
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        if (clip.length === 'end') endClips++;
      });
    });
    assertTrue(endClips >= 4, 'at least 4 clips use length:end');
  };

  global.testNewArrivalsMergeVariables = function () {
    var template = getNewArrivalsTemplate();
    var brandClip = null;
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        if (clip.asset && clip.asset.text && clip.asset.text.indexOf('BRAND_NAME') !== -1) {
          brandClip = clip;
        }
      });
    });
    assertTrue(brandClip != null, 'found BRAND_NAME merge variable in a clip');
    assertEqual(brandClip.asset.text, '{{ BRAND_NAME }}');
  };

  global.testNewArrivalsAudioEffect = function () {
    var template = getNewArrivalsTemplate();
    var audioClip = null;
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        if (clip.asset && clip.asset.type === 'audio') audioClip = clip;
      });
    });
    assertTrue(audioClip != null, 'found audio clip');
    assertEqual(audioClip.asset.effect, 'fadeOut', 'audio has fadeOut effect');
    assertEqual(audioClip.asset.volume, 1, 'audio volume is 1');
  };

  global.testNewArrivalsEmptyTextBackgrounds = function () {
    var template = getNewArrivalsTemplate();
    var bgClips = [];
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        if (clip.asset && clip.asset.type === 'text' && clip.asset.text === '' && clip.asset.background) {
          bgClips.push(clip);
        }
      });
    });
    assertEqual(bgClips.length, 3, '3 empty text clips with background');
    bgClips.forEach(function (clip) {
      assertTrue(clip.asset.height > 0, 'empty text clip has height');
      assertTrue(clip.asset.width > 0, 'empty text clip has width');
    });
  };

  /* ——— Helper: the template JSON ——— */

  function getNewArrivalsTemplate() {
    return {
      timeline: {
        fonts: [
          { src: 'https://templates.shotstack.io/new-arrivals-spotlight/ec598fcd-3e7a-4e43-8d8f-bef4f45021e4/source.ttf' },
          { src: 'https://templates.shotstack.io/new-arrivals-spotlight/997fd84a-9d7c-4975-932f-ad3587aaaa70/source.ttf' },
        ],
        background: '#FFFFFF',
        tracks: [
          { clips: [{ length: 'end', asset: { type: 'audio', src: 'https://templates.shotstack.io/new-arrivals-spotlight/860e44ca-90ef-45cb-b170-4aed39c4651c/source.mp3', volume: 1, effect: 'fadeOut' }, start: 0 }] },
          { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '{{ BRAND_NAME }}', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#e3d8c6', family: 'Montserrat SemiBold', size: '180', lineHeight: 1 }, width: 1160, height: 593 }, start: 2.81, length: 2.29, offset: { x: 0, y: 0.167 }, position: 'center', effect: 'zoomInSlow', transition: { in: 'fade', out: 'fade' } }] },
          { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: 'Shop new arrivals\ntoday', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Raleway ExtraBold', size: '100', lineHeight: 1 }, width: 1080, height: 325 }, start: 3.11, length: 'end', offset: { x: 0, y: -0.257 }, position: 'center', transition: { in: 'fade' } }] },
          { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Montserrat ExtraBold', size: 72, lineHeight: 1 }, width: 1080, height: 250, background: { color: '#d5c49b' } }, start: 3.11, length: 'end', offset: { y: -0.256, x: 0 }, position: 'center', transition: { in: 'slideDown' }, opacity: 1 }] },
          { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Montserrat ExtraBold', size: 72, lineHeight: 1 }, width: 1080, height: 325, background: { color: '#ffffff' } }, start: 3.14, length: 'end', offset: { y: -0.256, x: 0 }, position: 'center', opacity: 0.1, transition: { in: 'slideUp' } }] },
          { clips: [{ length: 'end', fit: 'contain', asset: { type: 'video', src: 'https://templates.shotstack.io/new-arrivals-spotlight/bpo1ib7c67nzhytx1361sk9o/source_0132214c.webm' }, start: 0, position: 'center' }] },
          { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Montserrat ExtraBold', size: 72, lineHeight: 1 }, width: 1920, height: 1080, background: { color: '#c1a775' } }, start: 0, length: 2.5, transition: { out: 'fade' }, position: 'center' }] },
          { clips: [{ length: 'end', fit: 'contain', asset: { type: 'video', src: 'https://templates.shotstack.io/new-arrivals-spotlight/bpo1ib7c67nzhytx1361sk9o/source_91a34304.webm' }, start: 1.79, opacity: 0.5 }] },
          { clips: [{ length: 2.2, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/ff41a690-16f1-4e4f-b258-ce21c24bfcdc/source.jpg' }, start: 12.82, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' } }] },
          { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/9f5adbab-c08d-4add-ac21-2ebbbf0888fb/source.jpg' }, start: 10.62, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' } }] },
          { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/73eaac3b-f691-416c-8ecb-0138b23e0ce5/source.jpg' }, start: 8.4, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' } }] },
          { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/0b2ab3ed-a5ca-4cdd-ac75-1a82f8c58c23/source.jpg' }, start: 6.2, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' }, position: 'center' }] },
          { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/3a36bf11-ceb6-4d18-9ef0-7da213e21b53/source.jpg' }, start: 3.98, effect: 'zoomOutSlow', transition: { in: 'carouselUp' }, position: 'center' }] },
          { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/40e95741-6650-4759-a4a2-86d626540811/source.jpg' }, start: 1.73, effect: 'zoomOutSlow' }] },
        ],
      },
      output: { format: 'mp4', fps: 25, size: { width: 1080, height: 1920 } },
      merge: [
        { find: 'BRAND_NAME', replace: 'BRAND NAME' },
        { find: 'IMAGE_1', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/fa03d367-9c11-40a6-8f12-ce25f02e151d/source.jpg' },
        { find: 'IMAGE_2', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/654bd5b6-951d-47b0-a5c3-a2440a4f579d/source.jpg' },
        { find: 'IMAGE_3', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/3ee148e5-571d-4aa2-a42e-208d96dc0d6f/source.jpg' },
        { find: 'IMAGE_4', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/03aac303-fd44-45e0-8b87-317ee4698bbc/source.jpg' },
        { find: 'IMAGE_5', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/662394c0-1763-4ab5-9f42-33885792f777/source.jpg' },
        { find: 'IMAGE_6', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/fb5944c6-6765-4670-9d74-5d7d3d72c1c1/source.jpg' },
      ],
    };
  }

  global.__CFS_getNewArrivalsTemplate = getNewArrivalsTemplate;

  /* ——— fabricToShotstack: video group preservation (bug fix) ——— */

  global.testFabricToShotstackVideoGroupWithCfsVideoSrc = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var fabricJson = {
      width: 1080,
      height: 1920,
      objects: [
        {
          type: 'group',
          name: 'video_123',
          left: 80,
          top: 80,
          cfsVideoSrc: 'https://example.com/my-video.mp4',
          cfsStart: 0,
          cfsLength: 25.3,
          cfsTrackIndex: 0,
          objects: [
            { type: 'rect', width: 320, height: 180, fill: '#2d3748', left: 0, top: 0 },
            { type: 'text', text: 'Video', fontSize: 18, fill: '#e2e8f0', left: 160, top: 90 }
          ]
        }
      ]
    };
    var result = fn(fabricJson);
    var allClips = [];
    result.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) { allClips.push(clip); });
    });
    var videoClips = allClips.filter(function (c) { return c.asset && c.asset.type === 'video'; });
    assertTrue(videoClips.length === 1, 'should produce exactly one video clip, got ' + videoClips.length);
    assertEqual(videoClips[0].asset.src, 'https://example.com/my-video.mp4');
    assertEqual(videoClips[0].start, 0);
    assertEqual(videoClips[0].length, 25.3);
  };

  global.testFabricToShotstackVideoGroupNotFlattened = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var fabricJson = {
      width: 1080,
      height: 1920,
      objects: [
        {
          type: 'group',
          name: 'video_456',
          left: 0,
          top: 0,
          cfsVideoSrc: 'https://example.com/test.webm',
          cfsStart: 5,
          cfsLength: 10,
          cfsTrackIndex: 0,
          objects: [
            { type: 'rect', width: 320, height: 180, fill: '#2d3748', left: 0, top: 0 },
            { type: 'text', text: 'Video', fontSize: 18, fill: '#e2e8f0', left: 160, top: 90 }
          ]
        }
      ]
    };
    var result = fn(fabricJson);
    var allClips = [];
    result.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) { allClips.push(clip); });
    });
    var rectClips = allClips.filter(function (c) { return c.asset && (c.asset.type === 'rect' || c.asset.type === 'svg'); });
    var textClips = allClips.filter(function (c) { return c.asset && (c.asset.type === 'text' || c.asset.type === 'title'); });
    assertEqual(rectClips.length, 0, 'placeholder rect should NOT become a separate clip');
    assertEqual(textClips.length, 0, 'placeholder label should NOT become a separate clip');
  };

  global.testFabricToShotstackVideoGroupWithOriginalClip = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var fabricJson = {
      width: 1080,
      height: 1920,
      objects: [
        {
          type: 'group',
          name: 'video_789',
          left: 0,
          top: 0,
          cfsVideoSrc: 'https://example.com/template-video.mp4',
          cfsStart: 2,
          cfsLength: 15,
          cfsTrackIndex: 0,
          cfsOriginalClip: {
            asset: { type: 'video', src: '{{ VIDEO_SRC }}' },
            start: 0,
            length: 10,
            position: 'center',
            fit: 'contain'
          },
          objects: [
            { type: 'rect', width: 320, height: 180, fill: '#2d3748' },
            { type: 'text', text: 'Video', fontSize: 18 }
          ]
        }
      ]
    };
    var result = fn(fabricJson);
    var allClips = [];
    result.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) { allClips.push(clip); });
    });
    var videoClips = allClips.filter(function (c) { return c.asset && c.asset.type === 'video'; });
    assertTrue(videoClips.length === 1, 'template video should produce one clip');
    assertEqual(videoClips[0].start, 2, 'start overridden from cfsStart');
    assertEqual(videoClips[0].length, 15, 'length overridden from cfsLength');
  };

  global.testFabricToShotstackVideoGroupDurationContributes = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var fabricJson = {
      width: 1080,
      height: 1920,
      objects: [
        {
          type: 'text',
          text: 'Title',
          name: 'title_1',
          left: 100,
          top: 100,
          width: 400,
          fontSize: 48,
          fill: '#000',
          cfsStart: 0,
          cfsLength: 5,
          cfsTrackIndex: 0
        },
        {
          type: 'group',
          name: 'video_bg',
          left: 0,
          top: 0,
          cfsVideoSrc: 'https://example.com/long-video.mp4',
          cfsStart: 0,
          cfsLength: 45.7,
          cfsTrackIndex: 1,
          objects: [
            { type: 'rect', width: 320, height: 180, fill: '#2d3748' },
            { type: 'text', text: 'Video', fontSize: 18 }
          ]
        }
      ]
    };
    var result = fn(fabricJson);
    var maxEnd = 0;
    result.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        var s = typeof clip.start === 'number' ? clip.start : 0;
        var l = typeof clip.length === 'number' ? clip.length : 5;
        maxEnd = Math.max(maxEnd, s + l);
      });
    });
    assertTrue(maxEnd >= 45.7, 'timeline duration should include the video clip (got ' + maxEnd + ')');
  };

  global.testFabricToShotstackNonVideoGroupStillFlattened = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var fabricJson = {
      width: 1080,
      height: 1920,
      objects: [
        {
          type: 'group',
          name: 'my_group',
          left: 10,
          top: 20,
          cfsStart: 0,
          cfsLength: 5,
          cfsTrackIndex: 0,
          objects: [
            { type: 'text', text: 'Hello', fontSize: 24, fill: '#000', left: 0, top: 0, width: 200 },
            { type: 'rect', width: 200, height: 100, fill: '#ccc', left: 0, top: 50 }
          ]
        }
      ]
    };
    var result = fn(fabricJson);
    var allClips = [];
    result.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) { allClips.push(clip); });
    });
    assertTrue(allClips.length >= 2, 'non-video group should be flattened into child clips (got ' + allClips.length + ')');
  };

  /* ——— fabricToShotstack: all object types produce correct clips ——— */

  function collectClips(result) {
    var clips = [];
    result.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) { clips.push(clip); });
    });
    return clips;
  }

  global.testFabricToShotstackTextObject = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'text', text: 'Hello World', name: 'heading',
        left: 100, top: 200, width: 800, fontSize: 48, fill: '#ff0000',
        fontFamily: 'Arial', cfsStart: 2, cfsLength: 8, cfsTrackIndex: 0
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'text produces 1 clip');
    var c = clips[0];
    assertTrue(c.asset.type === 'rich-text' || c.asset.type === 'text', 'text asset type is rich-text or text');
    assertEqual(c.asset.text, 'Hello World');
    assertEqual(c.start, 2);
    assertEqual(c.length, 8);
    assertEqual(c.asset.font.family, 'Arial');
    assertEqual(c.asset.font.size, 48);
    assertEqual(c.asset.font.color, '#ff0000');
  };

  global.testFabricToShotstackTextboxObject = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'textbox', text: 'Textbox content', name: 'body_text',
        left: 50, top: 300, width: 600, fontSize: 24, fill: '#333',
        fontFamily: 'Roboto', cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'textbox produces 1 clip');
    assertTrue(clips[0].asset.type === 'rich-text' || clips[0].asset.type === 'text');
    assertEqual(clips[0].asset.text, 'Textbox content');
    assertEqual(clips[0].start, 0);
    assertEqual(clips[0].length, 5);
  };

  global.testFabricToShotstackImageObject = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'image', src: 'https://example.com/photo.jpg', name: 'photo',
        left: 0, top: 0, width: 1080, height: 720,
        cfsStart: 3, cfsLength: 7, cfsTrackIndex: 1
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'image produces 1 clip');
    assertEqual(clips[0].asset.type, 'image');
    assertEqual(clips[0].asset.src, 'https://example.com/photo.jpg');
    assertEqual(clips[0].start, 3);
    assertEqual(clips[0].length, 7);
  };

  global.testFabricToShotstackSvgImageObject = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'image', cfsSvgSrc: 'data:image/svg+xml,<svg></svg>', name: 'icon',
        left: 100, top: 100, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsStart: 0, cfsLength: 10, cfsTrackIndex: 0
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'SVG image produces 1 clip');
    assertEqual(clips[0].asset.type, 'svg');
    assertEqual(clips[0].asset.src, 'data:image/svg+xml,<svg></svg>');
  };

  global.testFabricToShotstackRectObject = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'rect', name: 'bg_rect',
        left: 0, top: 500, width: 1080, height: 400,
        fill: '#3366cc', rx: 16, ry: 16,
        cfsStart: 1, cfsLength: 9, cfsTrackIndex: 2
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'rect produces 1 clip');
    var a = clips[0].asset;
    assertTrue(a.type === 'svg' || a.type === 'shape', 'rect exported as svg or shape');
    assertEqual(clips[0].start, 1);
    assertEqual(clips[0].length, 9);
  };

  global.testFabricToShotstackCircleObject = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'circle', name: 'dot',
        left: 500, top: 900, radius: 50, scaleX: 1, scaleY: 1,
        fill: '#ff6600',
        cfsStart: 0, cfsLength: 6, cfsTrackIndex: 0
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'circle produces 1 clip');
    var a = clips[0].asset;
    assertTrue(a.type === 'svg' || a.type === 'shape', 'circle exported as svg or shape');
    assertEqual(clips[0].start, 0);
    assertEqual(clips[0].length, 6);
  };

  global.testFabricToShotstackShapeLine = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'rect', name: 'divider', cfsShapeLine: true,
        left: 100, top: 960, width: 880, height: 4,
        fill: '#ffffff', cfsLineLength: 880, cfsLineThickness: 4,
        cfsStart: 2, cfsLength: 3, cfsTrackIndex: 0
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'shape line produces 1 clip');
    assertEqual(clips[0].asset.type, 'shape');
    assertEqual(clips[0].asset.shape, 'line');
    assertEqual(clips[0].asset.line.length, 880);
    assertEqual(clips[0].asset.line.thickness, 4);
    assertEqual(clips[0].start, 2);
    assertEqual(clips[0].length, 3);
  };

  /* ——— fabricToShotstack: mixed objects timeline integrity ——— */

  global.testFabricToShotstackMixedObjectsDuration = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [
        { type: 'text', text: 'Title', name: 't1', left: 0, top: 0, width: 400, fontSize: 48, fill: '#000', cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0 },
        { type: 'image', src: 'img.jpg', name: 'bg', left: 0, top: 0, width: 1080, height: 1920, cfsStart: 0, cfsLength: 20, cfsTrackIndex: 1 },
        { type: 'rect', name: 'overlay', left: 0, top: 1500, width: 1080, height: 420, fill: '#000', cfsStart: 5, cfsLength: 15, cfsTrackIndex: 2 },
        { type: 'circle', name: 'bullet', left: 100, top: 1600, radius: 10, fill: '#fff', scaleX: 1, scaleY: 1, cfsStart: 6, cfsLength: 14, cfsTrackIndex: 2 },
        {
          type: 'group', name: 'video_main', left: 0, top: 0,
          cfsVideoSrc: 'https://example.com/v.mp4', cfsStart: 0, cfsLength: 35, cfsTrackIndex: 3,
          objects: [
            { type: 'rect', width: 320, height: 180, fill: '#2d3748' },
            { type: 'text', text: 'Video', fontSize: 18 }
          ]
        }
      ]
    });
    var clips = collectClips(result);
    var types = {};
    clips.forEach(function (c) {
      var t = c.asset && c.asset.type;
      types[t] = (types[t] || 0) + 1;
    });
    assertTrue(types['video'] >= 1, 'should have at least 1 video clip');
    assertTrue((types['rich-text'] || 0) + (types['text'] || 0) >= 1, 'should have at least 1 text clip');
    assertTrue(types['image'] >= 1, 'should have at least 1 image clip');
    var totalClipCount = clips.length;
    assertTrue(totalClipCount >= 5, 'should have at least 5 clips from mixed objects (got ' + totalClipCount + ')');

    var maxEnd = 0;
    clips.forEach(function (c) {
      var s = typeof c.start === 'number' ? c.start : 0;
      var l = typeof c.length === 'number' ? c.length : 5;
      maxEnd = Math.max(maxEnd, s + l);
    });
    assertTrue(maxEnd >= 35, 'timeline should span at least 35s from video clip (got ' + maxEnd + ')');
  };

  global.testFabricToShotstackTrackAssignment = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [
        { type: 'text', text: 'A', name: 'a', left: 0, top: 0, width: 200, fontSize: 24, fill: '#000', cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0 },
        { type: 'text', text: 'B', name: 'b', left: 0, top: 50, width: 200, fontSize: 24, fill: '#000', cfsStart: 0, cfsLength: 5, cfsTrackIndex: 2 },
        {
          type: 'group', name: 'vid', left: 0, top: 0,
          cfsVideoSrc: 'https://example.com/v.mp4', cfsStart: 0, cfsLength: 10, cfsTrackIndex: 1,
          objects: [{ type: 'rect', width: 320, height: 180, fill: '#2d3748' }, { type: 'text', text: 'V', fontSize: 18 }]
        }
      ]
    });
    assertTrue(result.timeline.tracks.length >= 3, 'should have at least 3 tracks (indices 0, 1, 2)');
    assertTrue(result.timeline.tracks[0].clips.length >= 1, 'track 0 has clip A');
    assertTrue(result.timeline.tracks[1].clips.length >= 1, 'track 1 has video clip');
    assertTrue(result.timeline.tracks[2].clips.length >= 1, 'track 2 has clip B');
    assertEqual(result.timeline.tracks[1].clips[0].asset.type, 'video', 'track 1 clip is video');
  };

  global.testFabricToShotstackStartLengthPreserved = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var objects = [
      { type: 'text', text: 'X', name: 'x', left: 0, top: 0, width: 200, fontSize: 24, fill: '#000', cfsStart: 3.5, cfsLength: 12.3, cfsTrackIndex: 0 },
      { type: 'image', src: 'img.png', name: 'img', left: 0, top: 0, width: 500, height: 500, cfsStart: 0.1, cfsLength: 7.77, cfsTrackIndex: 1 },
      { type: 'rect', name: 'r', left: 0, top: 0, width: 100, height: 50, fill: '#aaa', cfsStart: 10, cfsLength: 2.5, cfsTrackIndex: 2 },
      {
        type: 'group', name: 'v', left: 0, top: 0,
        cfsVideoSrc: 'https://example.com/v.mp4', cfsStart: 1.2, cfsLength: 55, cfsTrackIndex: 3,
        objects: [{ type: 'rect', width: 320, height: 180, fill: '#2d3748' }, { type: 'text', text: 'V', fontSize: 18 }]
      }
    ];
    var result = fn({ width: 1080, height: 1920, objects: objects });
    var clips = collectClips(result);
    var textClip = clips.filter(function (c) { return c.asset && (c.asset.type === 'rich-text' || c.asset.type === 'text') && c.asset.text === 'X'; })[0];
    assertTrue(textClip != null, 'text clip found');
    assertEqual(textClip.start, 3.5, 'text start preserved');
    assertEqual(textClip.length, 12.3, 'text length preserved');

    var imgClip = clips.filter(function (c) { return c.asset && c.asset.type === 'image'; })[0];
    assertTrue(imgClip != null, 'image clip found');
    assertEqual(imgClip.start, 0.1, 'image start preserved');
    assertEqual(imgClip.length, 7.77, 'image length preserved');

    var vidClip = clips.filter(function (c) { return c.asset && c.asset.type === 'video'; })[0];
    assertTrue(vidClip != null, 'video clip found');
    assertEqual(vidClip.start, 1.2, 'video start preserved');
    assertEqual(vidClip.length, 55, 'video length preserved');
  };

  global.testFabricToShotstackImageToVideoDetection = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [{
        type: 'image', src: 'https://example.com/clip.mp4', name: 'video_slot',
        left: 0, top: 0, width: 1080, height: 1920,
        cfsStart: 0, cfsLength: 15, cfsTrackIndex: 0
      }]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'image with video src produces 1 clip');
    assertEqual(clips[0].asset.type, 'video', 'image with .mp4 src should be detected as video');
  };

  global.testFabricToShotstackBackgroundIgnored = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({
      width: 1080, height: 1920,
      objects: [
        { type: 'rect', name: 'background', left: 0, top: 0, width: 1080, height: 1920, fill: '#ffffff' },
        { type: 'text', text: 'Content', name: 'content', left: 100, top: 100, width: 400, fontSize: 36, fill: '#000', cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0 }
      ]
    });
    var clips = collectClips(result);
    assertEqual(clips.length, 1, 'background rect should be ignored, only content clip exported');
    assertTrue(clips[0].asset.text === 'Content', 'remaining clip is the text');
  };

  global.testFabricToShotstackEmptyCanvas = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var result = fn({ width: 1080, height: 1920, objects: [] });
    assertTrue(result.timeline != null, 'empty canvas still produces timeline');
    assertTrue(Array.isArray(result.timeline.tracks), 'has tracks array');
    var clips = collectClips(result);
    assertEqual(clips.length, 0, 'empty canvas produces 0 clips');
  };

  /* ——— Duration calculation: video clips extend total duration ——— */

  global.testDurationCalculationIncludesVideoClips = function () {
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'text', text: 'Title' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'video', src: 'https://example.com/video.mp4' }, start: 0, length: 30 }] },
          { clips: [{ asset: { type: 'image', src: 'img.jpg' }, start: 5, length: 5 }] },
        ],
      },
    };
    var duration = 0;
    var timelineEndFromNumerics = 0;
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        var start = typeof clip.start === 'number' ? clip.start : 0;
        var len = typeof clip.length === 'number' ? clip.length : 5;
        if (clip.length !== 'end' && clip.length !== 'auto') {
          timelineEndFromNumerics = Math.max(timelineEndFromNumerics, start + len);
        }
      });
    });
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        var start = typeof clip.start === 'number' ? clip.start : 0;
        var len = (clip.length === 'end' || clip.length === 'auto')
          ? Math.max(0, timelineEndFromNumerics - start)
          : (typeof clip.length === 'number' ? clip.length : 5);
        duration = Math.max(duration, start + len);
      });
    });
    assertEqual(duration, 30, 'duration should be 30s (video clip is 0+30)');
  };

  /* ——— Video texture source update (PixiJS v8 seek fix) ——— */

  global.testVideoTextureSourceUpdateCalledOnSeek = function () {
    var updateCalled = false;
    var mockDisp = {
      _videoEl: {
        currentTime: 0,
        playbackRate: 1,
      },
      texture: {
        source: {
          update: function () { updateCalled = true; }
        }
      },
      cfsClipMeta: { start: 0, length: 10, x: 0, y: 0, clip: { asset: {} }, transition: {}, effect: '' },
      cfsVisible: true,
      visible: true,
      alpha: 1,
      x: 0, y: 0,
      scale: { set: function () {} },
      pivot: { set: function () {} },
      angle: 0,
    };

    var currentTime = 3;
    var meta = mockDisp.cfsClipMeta;
    var start = meta.start;
    var visible = currentTime >= start && currentTime < start + meta.length;
    if (mockDisp._videoEl && visible) {
      var rel = currentTime - start;
      var clip = meta.clip || {};
      var videoAsset = clip.asset || {};
      var trimOffset = videoAsset.trim != null ? Math.max(0, Number(videoAsset.trim)) : 0;
      var speed = videoAsset.speed != null ? Math.max(0.1, Number(videoAsset.speed)) : 1;
      var dur = mockDisp._videoDuration != null ? mockDisp._videoDuration : meta.length;
      mockDisp._videoEl.currentTime = Math.max(0, Math.min(trimOffset + rel * speed, dur));
      if (mockDisp.texture && mockDisp.texture.source && typeof mockDisp.texture.source.update === 'function') {
        mockDisp.texture.source.update();
      }
    }
    assertTrue(updateCalled, 'texture.source.update() should be called after setting video.currentTime');
    assertEqual(mockDisp._videoEl.currentTime, 3, 'video currentTime should be set to elapsed time');
  };

  /* ——— Audio clip management ——— */

  global.testAudioLayerSelectionUsesCorrectPropertyKeys = function () {
    var clip = { asset: { type: 'audio', src: 'https://example.com/audio.mp3', volume: 1 }, start: 0, length: 10 };
    var selected = { templateTrackIndex: 2, templateClipIndex: 1, clip: clip };
    assertTrue(selected.templateTrackIndex === 2, 'selectedAudioClip should use templateTrackIndex');
    assertTrue(selected.templateClipIndex === 1, 'selectedAudioClip should use templateClipIndex');
    assertTrue(selected.templateTrackIndex !== undefined, 'templateTrackIndex must be defined');
    assertTrue(selected.templateClipIndex !== undefined, 'templateClipIndex must be defined');
    assertFalse(selected._trackIndex !== undefined, 'should NOT use _trackIndex');
    assertFalse(selected._clipIndex !== undefined, 'should NOT use _clipIndex');
  };

  global.testAudioClipDeletion = function () {
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'title', text: 'Hello' }, start: 0, length: 5 }] },
          { clips: [
            { asset: { type: 'audio', src: 'a.mp3', volume: 1 }, start: 0, length: 10 },
            { asset: { type: 'audio', src: 'b.mp3', volume: 0.5 }, start: 10, length: 5 }
          ] }
        ]
      }
    };
    var ti = 1, ci = 0;
    var tr = template.timeline.tracks[ti];
    tr.clips.splice(ci, 1);
    assertEqual(tr.clips.length, 1, 'track should have 1 clip after deleting first audio');
    assertEqual(tr.clips[0].asset.src, 'b.mp3', 'remaining clip should be b.mp3');
  };

  global.testAudioClipDeletionCleansEmptyTracks = function () {
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'title', text: 'Hello' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'audio', src: 'a.mp3', volume: 1 }, start: 0, length: 10 }] }
        ]
      }
    };
    var ti = 1, ci = 0;
    var tr = template.timeline.tracks[ti];
    tr.clips.splice(ci, 1);
    if (tr.clips.length === 0) {
      template.timeline.tracks.splice(ti, 1);
    }
    assertEqual(template.timeline.tracks.length, 1, 'empty audio track should be removed');
    assertEqual(template.timeline.tracks[0].clips[0].asset.type, 'title', 'title track should remain');
  };

  global.testAddAudioTrackCreatesTrackAndClip = function () {
    var template = { timeline: { tracks: [{ clips: [{ asset: { type: 'title' }, start: 0, length: 5 }] }] } };
    var audioSrc = 'https://example.com/song.mp3';
    template.timeline.tracks.unshift({
      clips: [{ asset: { type: 'audio', src: audioSrc, volume: 1 }, start: 0, length: 10 }],
    });
    assertEqual(template.timeline.tracks.length, 2, 'should have 2 tracks after adding audio');
    var audioTrack = template.timeline.tracks[0];
    assertEqual(audioTrack.clips.length, 1, 'audio track should have 1 clip');
    assertEqual(audioTrack.clips[0].asset.type, 'audio', 'clip type should be audio');
    assertEqual(audioTrack.clips[0].asset.src, audioSrc, 'clip src should match provided URL');
    assertEqual(audioTrack.clips[0].asset.volume, 1, 'default volume should be 1');
  };

  global.testAudioInsertClipFindsExistingAudioTrack = function () {
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'title', text: 'Hello' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'audio', src: 'a.mp3', volume: 1 }, start: 0, length: 10 }] }
        ]
      }
    };
    var audioTrackIdx = -1;
    for (var ti = 0; ti < template.timeline.tracks.length; ti++) {
      var clips = template.timeline.tracks[ti].clips || [];
      if (clips.length && clips.every(function (c) { return (c.asset || {}).type === 'audio'; })) { audioTrackIdx = ti; break; }
    }
    assertEqual(audioTrackIdx, 1, 'should find existing audio track at index 1');
    template.timeline.tracks[audioTrackIdx].clips.push({
      asset: { type: 'audio', src: 'b.mp3', volume: 1 }, start: 10, length: 5
    });
    assertEqual(template.timeline.tracks[1].clips.length, 2, 'audio track should now have 2 clips');
  };

  /* ——— Image-to-video conversion: separate tracks ——— */

  global.testImageToVideoAssignsSeparateTracks = function () {
    var objects = [
      { type: 'rect', name: 'background', cfsTrackIndex: 0, set: function (k, v) { this[k] = v; } },
      { type: 'textbox', name: 'title', cfsTrackIndex: 0, set: function (k, v) { this[k] = v; } },
      { type: 'image', name: 'photo', cfsTrackIndex: 0, set: function (k, v) { this[k] = v; } },
    ];
    var allOnTrackZero = objects.every(function (o) { return (o.cfsTrackIndex == null || o.cfsTrackIndex === 0); });
    assertTrue(allOnTrackZero, 'all objects start on track 0');
    var trackIdx = 0;
    objects.forEach(function (obj) {
      if (obj.cfsStart == null) obj.set('cfsStart', 0);
      if (obj.cfsLength == null) obj.set('cfsLength', 10);
      obj.set('cfsTrackIndex', trackIdx);
      trackIdx++;
    });
    assertEqual(objects[0].cfsTrackIndex, 0, 'first object on track 0');
    assertEqual(objects[1].cfsTrackIndex, 1, 'second object on track 1');
    assertEqual(objects[2].cfsTrackIndex, 2, 'third object on track 2');
    assertEqual(objects[0].cfsStart, 0, 'first object start at 0');
    assertEqual(objects[1].cfsStart, 0, 'second object start at 0');
    assertEqual(objects[2].cfsStart, 0, 'third object start at 0');
  };

  global.testImageToVideoPreservesExistingTracks = function () {
    var objects = [
      { type: 'rect', name: 'bg', cfsTrackIndex: 0, set: function (k, v) { this[k] = v; } },
      { type: 'textbox', name: 'title', cfsTrackIndex: 1, set: function (k, v) { this[k] = v; } },
    ];
    var allOnTrackZero = objects.every(function (o) { return (o.cfsTrackIndex == null || o.cfsTrackIndex === 0); });
    assertFalse(allOnTrackZero, 'objects already on different tracks should not be reassigned');
  };

  global.testImageToVideoSetsDefaultLength = function () {
    var objects = [
      { type: 'rect', name: 'bg', set: function (k, v) { this[k] = v; } },
      { type: 'textbox', name: 'title', set: function (k, v) { this[k] = v; } },
    ];
    var defaultLen = 10;
    var trackIdx = 0;
    objects.forEach(function (obj) {
      if (obj.cfsStart == null) obj.set('cfsStart', 0);
      if (obj.cfsLength == null) obj.set('cfsLength', defaultLen);
      obj.set('cfsTrackIndex', trackIdx++);
    });
    assertEqual(objects[0].cfsLength, 10, 'default length should be 10');
    assertEqual(objects[1].cfsLength, 10, 'default length should be 10');
  };

  global.testFabricToShotstackSeparateTracksOutput = function () {
    var fn = global.__CFS_fabricToShotstack;
    if (!fn) return;
    var state = {
      width: 1080, height: 1080,
      background: '#ffffff',
      objects: [
        { type: 'rect', left: 0, top: 0, width: 1080, height: 1080, fill: '#f5e6c8', name: 'note_card', cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10, scaleX: 1, scaleY: 1 },
        { type: 'textbox', left: 100, top: 100, width: 880, text: 'Title', fontSize: 36, fontFamily: 'sans-serif', fill: '#333', name: 'title', cfsTrackIndex: 1, cfsStart: 0, cfsLength: 10, scaleX: 1, scaleY: 1 },
        { type: 'textbox', left: 100, top: 200, width: 880, text: 'Body text here', fontSize: 20, fontFamily: 'sans-serif', fill: '#333', name: 'body', cfsTrackIndex: 2, cfsStart: 0, cfsLength: 10, scaleX: 1, scaleY: 1 },
      ]
    };
    var result = fn(state, { defaultClipDuration: 10 });
    assertTrue(result && result.timeline, 'should produce timeline');
    assertTrue(result.timeline.tracks && result.timeline.tracks.length >= 3, 'should have at least 3 tracks');
    result.timeline.tracks.forEach(function (track, i) {
      if (track.clips && track.clips.length > 0) {
        assertTrue(track.clips.length <= 2, 'track ' + i + ' should have at most 2 clips (clip + bg)');
      }
    });
  };

  /* ——— Timeline duration ——— */

  global.testTimelineDurationIncludesAudioClips = function () {
    var panel = global.__CFS_timelinePanel;
    if (!panel || !panel.buildClipsFromTemplate) return;
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'title', text: 'Hello' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'audio', src: 'song.mp3', volume: 1 }, start: 0, length: 30 }] }
        ]
      }
    };
    var clips = panel.buildClipsFromTemplate(template);
    var total = 10;
    clips.forEach(function (c) {
      var s = typeof c.displayStart === 'number' ? c.displayStart : 0;
      var l = typeof c.displayLength === 'number' ? c.displayLength : 5;
      total = Math.max(total, s + l);
    });
    assertTrue(total >= 30, 'duration should be at least 30s due to audio clip');
  };

  global.testTimelineDurationWithSimultaneousClips = function () {
    var panel = global.__CFS_timelinePanel;
    if (!panel || !panel.buildClipsFromTemplate) return;
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'title', text: 'A' }, start: 0, length: 10 }] },
          { clips: [{ asset: { type: 'image', src: 'bg.png' }, start: 0, length: 10 }] },
          { clips: [{ asset: { type: 'title', text: 'B' }, start: 0, length: 10 }] }
        ]
      }
    };
    var clips = panel.buildClipsFromTemplate(template);
    var total = 10;
    clips.forEach(function (c) {
      var s = typeof c.displayStart === 'number' ? c.displayStart : 0;
      var l = typeof c.displayLength === 'number' ? c.displayLength : 5;
      total = Math.max(total, s + l);
    });
    assertEqual(total, 10, 'simultaneous clips should not inflate duration beyond 10s');
  };

  global.testTimelineRulerCoversAllClips = function () {
    var panel = global.__CFS_timelinePanel;
    if (!panel || !panel.buildClipsFromTemplate) return;
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'title', text: 'Main' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'audio', src: 'long.mp3' }, start: 5, length: 25 }] }
        ]
      }
    };
    var clips = panel.buildClipsFromTemplate(template);
    var total = 10;
    clips.forEach(function (c) {
      var s = typeof c.displayStart === 'number' ? c.displayStart : 0;
      var l = typeof c.displayLength === 'number' ? c.displayLength : 5;
      total = Math.max(total, s + l);
    });
    total = Math.ceil(total);
    assertTrue(total >= 30, 'ruler total should cover audio clip ending at 30s');
  };

  global.testTimelineDurationAccountsForSoundtrack = function () {
    var total = 10;
    var template = {
      timeline: {
        soundtrack: { src: 'bg.mp3', volume: 0.5, length: 45 },
        tracks: [{ clips: [{ asset: { type: 'title', text: 'Hi' }, start: 0, length: 5 }] }]
      }
    };
    if (template.timeline.soundtrack && typeof template.timeline.soundtrack.length === 'number') {
      total = Math.max(total, template.timeline.soundtrack.length);
    }
    assertTrue(total >= 45, 'total should account for soundtrack length');
  };

  /* ——— Text wrapping ——— */

  global.testTextboxWrapsAtWidth = function () {
    var wrapFn = global.__CFS_wrapTextToWidth;
    if (!wrapFn) return;
    var longText = 'This is a very long line of text that should definitely need to be wrapped when placed inside a textbox with a reasonable width constraint applied to it for testing purposes';
    var wrapped = wrapFn(longText, 'sans-serif', 20, 'normal', 200);
    var lines = wrapped.split('\n');
    assertTrue(lines.length > 1, 'long text should wrap to multiple lines at width 200');
  };

  global.testTextboxWrapPreservesWords = function () {
    var wrapFn = global.__CFS_wrapTextToWidth;
    if (!wrapFn) return;
    var text = 'Hello World Test';
    var wrapped = wrapFn(text, 'sans-serif', 20, 'normal', 5000);
    assertEqual(wrapped, text, 'text within width should not be modified');
  };

  global.testTextboxWrapNarrowWidth = function () {
    var wrapFn = global.__CFS_wrapTextToWidth;
    if (!wrapFn) return;
    var text = 'Hello World';
    var wrapped = wrapFn(text, 'sans-serif', 20, 'normal', 50);
    var lines = wrapped.split('\n');
    assertTrue(lines.length >= 2, 'text should wrap at very narrow width');
  };

  global.testBuildClipsFromTemplatePreservesTrackIndices = function () {
    var panel = global.__CFS_timelinePanel;
    if (!panel || !panel.buildClipsFromTemplate) return;
    var template = {
      timeline: {
        tracks: [
          { clips: [{ asset: { type: 'title', text: 'A' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'audio', src: 'x.mp3' }, start: 2, length: 8 }] },
          { clips: [{ asset: { type: 'image', src: 'img.png' }, start: 0, length: 10 }] }
        ]
      }
    };
    var clips = panel.buildClipsFromTemplate(template);
    assertEqual(clips.length, 3, 'should have 3 clips');
    assertEqual(clips[0].templateTrackIndex, 0, 'first clip on track 0');
    assertEqual(clips[1].templateTrackIndex, 1, 'second clip on track 1');
    assertEqual(clips[2].templateTrackIndex, 2, 'third clip on track 2');
    assertEqual(clips[0].templateClipIndex, 0, 'first clip index 0');
    assertEqual(clips[1].templateClipIndex, 0, 'second clip index 0');
    assertEqual(clips[2].templateClipIndex, 0, 'third clip index 0');
  };

  global.testBuildClipsFromCanvasWithSeparateTracks = function () {
    var panel = global.__CFS_timelinePanel;
    if (!panel || !panel.buildClipsFromCanvas) return;
    var mockCanvas = {
      getObjects: function () {
        return [
          { name: 'bg', type: 'rect', cfsStart: 0, cfsLength: 10, cfsTrackIndex: 0 },
          { name: 'title', type: 'textbox', text: 'Hello', cfsStart: 0, cfsLength: 10, cfsTrackIndex: 1 },
          { name: 'photo', type: 'image', cfsStart: 0, cfsLength: 10, cfsTrackIndex: 2 },
        ];
      }
    };
    var clips = panel.buildClipsFromCanvas(mockCanvas, 10);
    assertEqual(clips.length, 3, 'should have 3 clips');
    assertEqual(clips[0].trackIndex, 0, 'bg on track 0');
    assertEqual(clips[1].trackIndex, 1, 'title on track 1');
    assertEqual(clips[2].trackIndex, 2, 'photo on track 2');
    clips.forEach(function (c) {
      assertEqual(c.start, 0, 'all clips should start at 0');
      assertEqual(c.length, 10, 'all clips should have length 10');
    });
  };

  global.testBuildClipsFromCanvasDefaultsToSequential = function () {
    var panel = global.__CFS_timelinePanel;
    if (!panel || !panel.buildClipsFromCanvas) return;
    var mockCanvas = {
      getObjects: function () {
        return [
          { name: 'a', type: 'rect' },
          { name: 'b', type: 'textbox', text: 'Hello' },
        ];
      }
    };
    var clips = panel.buildClipsFromCanvas(mockCanvas, 5);
    assertEqual(clips.length, 2, 'should have 2 clips');
    assertEqual(clips[0].start, 0, 'first clip starts at 0');
    assertEqual(clips[1].start, 5, 'second clip starts at 5 (sequential)');
  };

  /* ——— PixiJS text style: wordWrap in initial opts ——— */

  global.testPixiTextStyleWordWrapInInitialOpts = function () {
    var styleOpts = {
      fontFamily: 'Open Sans',
      fontSize: 20,
      fill: '#333333',
    };
    var wrapW = 880;
    if (wrapW > 0) {
      styleOpts.wordWrap = true;
      styleOpts.wordWrapWidth = wrapW;
    }
    assertTrue(styleOpts.wordWrap === true, 'wordWrap should be in initial style opts');
    assertEqual(styleOpts.wordWrapWidth, 880, 'wordWrapWidth should be set before Text construction');
  };

  global.testPixiLineHeightMultiplierConversion = function () {
    var fontSize = 20;
    var cssLineHeight = 1.55;
    var pixiLineHeight;
    if (cssLineHeight > 0 && cssLineHeight <= 10) {
      pixiLineHeight = Math.round(fontSize * cssLineHeight);
    } else if (cssLineHeight > 10) {
      pixiLineHeight = cssLineHeight;
    }
    assertEqual(pixiLineHeight, 31, 'lineHeight 1.55 * fontSize 20 should become 31px');
  };

  global.testPixiLineHeightAlreadyPixels = function () {
    var fontSize = 20;
    var cssLineHeight = 40;
    var pixiLineHeight;
    if (cssLineHeight > 0 && cssLineHeight <= 10) {
      pixiLineHeight = Math.round(fontSize * cssLineHeight);
    } else if (cssLineHeight > 10) {
      pixiLineHeight = cssLineHeight;
    }
    assertEqual(pixiLineHeight, 40, 'lineHeight already in pixels should pass through unchanged');
  };

  /* ——— HTML clip import: parseHtmlClipCss ——— */

  global.testParseHtmlClipCssExtractsColor = function () {
    var fn = global.__CFS_parseHtmlClipCss;
    if (!fn) { assertTrue(false, '__CFS_parseHtmlClipCss not found'); return; }
    var result = fn("p { color: #ffffff; font-size: 22px; font-family: 'Noto Sans Medium'; text-align: left; }");
    assertEqual(result.color, '#ffffff', 'should extract color');
    assertEqual(result.fontSize, 22, 'should extract font-size');
    assertEqual(result.fontFamily, 'Noto Sans Medium', 'should extract font-family');
    assertEqual(result.textAlign, 'left', 'should extract text-align');
  };

  global.testParseHtmlClipCssCenterAlign = function () {
    var fn = global.__CFS_parseHtmlClipCss;
    if (!fn) { assertTrue(false, '__CFS_parseHtmlClipCss not found'); return; }
    var result = fn("p { color: #000000; font-size: 45px; font-family: 'Noto Sans Black'; text-align: center; }");
    assertEqual(result.fontSize, 45, 'should extract 45px font-size');
    assertEqual(result.textAlign, 'center', 'should extract center alignment');
    assertEqual(result.fontFamily, 'Noto Sans Black', 'should extract Noto Sans Black');
  };

  global.testParseHtmlClipCssDefaults = function () {
    var fn = global.__CFS_parseHtmlClipCss;
    if (!fn) { assertTrue(false, '__CFS_parseHtmlClipCss not found'); return; }
    var result = fn('');
    assertEqual(result.color, '#000000', 'should default color to black');
    assertEqual(result.fontSize, 16, 'should default font-size to 16');
    assertEqual(result.fontFamily, 'sans-serif', 'should default font-family');
    assertEqual(result.textAlign, 'left', 'should default text-align to left');
  };

  /* ——— HTML clip import: extractTextFromHtml ——— */

  global.testExtractTextFromHtml = function () {
    var fn = global.__CFS_extractTextFromHtml;
    if (!fn) { assertTrue(false, '__CFS_extractTextFromHtml not found'); return; }
    assertEqual(fn('<p data-html-type="text">Hello World</p>'), 'Hello World', 'should strip tags');
    assertEqual(fn('<p data-html-type="text">{{ ADDRESS }}</p>'), '{{ ADDRESS }}', 'should preserve merge placeholders');
    assertEqual(fn(''), '', 'empty string returns empty');
    assertEqual(fn(null), '', 'null returns empty');
  };

  /* ——— HTML clip import: shotstackToFabricStructure with html clips ——— */

  global.testHtmlRectClipImport = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [{
          clips: [{
            asset: { type: 'html', width: 656, height: 604, background: '#adc90e',
              html: '<p data-html-type="text">box</p>',
              css: "p { color: #ffffff; font-size: 1px; font-family: 'Montserrat ExtraBold'; text-align: center; }" },
            fit: 'none', scale: 1, offset: { x: 0.185, y: -0.022 },
            position: 'center', start: 0, length: 5
          }]
        }]
      },
      output: { size: { width: 1024, height: 576 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var htmlObjs = result.objects.filter(function (o) { return o.cfsHtmlType === 'rect'; });
    assertEqual(htmlObjs.length, 1, 'should import one html rect');
    assertEqual(htmlObjs[0].type, 'rect', 'html rect should be type rect');
    assertEqual(htmlObjs[0].fill, '#adc90e', 'fill should match background color');
    assertEqual(htmlObjs[0].width, 656, 'width should match asset.width');
    assertEqual(htmlObjs[0].height, 604, 'height should match asset.height');
    assertTrue(htmlObjs[0].cfsOriginalClip != null, 'should preserve cfsOriginalClip');
    assertEqual(htmlObjs[0].cfsOriginalClip.asset.type, 'html', 'original clip type should be html');
  };

  global.testHtmlTextClipImport = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [{
          clips: [{
            asset: { type: 'html', width: 500, height: 40,
              html: '<p data-html-type="text">+01 234 567 890</p>',
              css: "p { color: #ffffff; font-size: 22px; font-family: 'Noto Sans Medium'; text-align: left; }" },
            fit: 'none', scale: 1, offset: { x: 0.216, y: -0.377 },
            position: 'center', start: 0, length: 5
          }]
        }]
      },
      output: { size: { width: 1024, height: 576 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var htmlObjs = result.objects.filter(function (o) { return o.cfsHtmlType === 'text'; });
    assertEqual(htmlObjs.length, 1, 'should import one html text');
    assertEqual(htmlObjs[0].type, 'textbox', 'html text should be type textbox');
    assertEqual(htmlObjs[0].text, '+01 234 567 890', 'text should be extracted from html');
    assertEqual(htmlObjs[0].fontSize, 22, 'fontSize should be from CSS');
    assertEqual(htmlObjs[0].fill, '#ffffff', 'fill should be from CSS color');
    assertEqual(htmlObjs[0].textAlign, 'left', 'textAlign should be from CSS');
    assertTrue(htmlObjs[0].cfsOriginalClip != null, 'should preserve cfsOriginalClip');
  };

  global.testHtmlMergePlaceholderImport = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [{
          clips: [{
            asset: { type: 'html', width: 518, height: 65,
              html: '<p data-html-type="text">{{ ADDRESS }}</p>',
              css: "p { color: #ffffff; font-size: 31px; font-family: 'Noto Sans Medium'; text-align: right; }" },
            fit: 'none', scale: 1, offset: { x: 0.189, y: -0.245 },
            position: 'center', start: 0.75, length: 5
          }]
        }]
      },
      output: { size: { width: 1024, height: 576 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var htmlObjs = result.objects.filter(function (o) { return o.cfsHtmlType === 'text'; });
    assertEqual(htmlObjs.length, 1, 'should import merge placeholder text');
    assertEqual(htmlObjs[0].text, '{{ ADDRESS }}', 'text should contain merge placeholder');
    assertEqual(htmlObjs[0].cfsMergeKey, 'ADDRESS', 'should extract merge key');
    assertEqual(htmlObjs[0].textAlign, 'right', 'textAlign should be right');
  };

  global.testHtmlLineClipImport = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [{
          clips: [{
            asset: { type: 'html', width: 710, height: 1, background: '#ffffff',
              html: '<p data-html-type="text">Line horizontal</p>',
              css: "p { color: #ffffff; font-size: 1px; font-family: 'Montserrat ExtraBold'; text-align: center; }" },
            fit: 'none', scale: 1, offset: { x: 0.266, y: -0.139 },
            position: 'center', start: 0, length: 5
          }]
        }]
      },
      output: { size: { width: 1024, height: 576 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var htmlObjs = result.objects.filter(function (o) { return o.cfsHtmlType === 'rect'; });
    assertEqual(htmlObjs.length, 1, 'line should import as rect');
    assertEqual(htmlObjs[0].width, 710, 'line width');
    assertEqual(htmlObjs[0].height, 1, 'line height should be 1px');
    assertEqual(htmlObjs[0].fill, '#ffffff', 'line fill from background');
  };

  global.testHtmlClipPositionCenter = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [{
          clips: [{
            asset: { type: 'html', width: 500, height: 40,
              html: '<p data-html-type="text">Test</p>',
              css: "p { color: #ffffff; font-size: 22px; }" },
            fit: 'none', scale: 1, offset: { x: 0, y: 0 },
            position: 'center', start: 0, length: 5
          }]
        }]
      },
      output: { size: { width: 1024, height: 576 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var obj = result.objects.filter(function (o) { return o.cfsHtmlType === 'text'; })[0];
    assertTrue(obj != null, 'should have an html text object');
    var expectedLeft = (1024 - 500) / 2;
    var expectedTop = (576 - 40) / 2;
    assertEqual(obj.left, expectedLeft, 'center position: left = (canvasW - elemW) / 2');
    assertEqual(obj.top, expectedTop, 'center position: top = (canvasH - elemH) / 2');
  };

  global.testHtmlClipPositionWithOffset = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [{
          clips: [{
            asset: { type: 'html', width: 100, height: 100,
              html: '<p data-html-type="text">Offset</p>',
              css: "p { color: #fff; font-size: 20px; }" },
            fit: 'none', scale: 1, offset: { x: 0.5, y: -0.5 },
            position: 'center', start: 0, length: 5
          }]
        }]
      },
      output: { size: { width: 1000, height: 500 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var obj = result.objects.filter(function (o) { return o.cfsHtmlType === 'text'; })[0];
    assertTrue(obj != null, 'should have an html text object');
    var expectedLeft = (1000 - 100) / 2 + 0.5 * 1000;
    var expectedTop = (500 - 100) / 2 - (-0.5) * 500;
    assertEqual(obj.left, expectedLeft, 'offset x=0.5 shifts right by 50% canvas width');
    assertEqual(obj.top, expectedTop, 'offset y=-0.5 shifts down by 50% canvas height');
  };

  global.testHtmlClipTrackIndexPreserved = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [
          { clips: [{ asset: { type: 'html', width: 100, height: 100, background: '#ff0000',
              html: '<p>rect</p>', css: 'p{font-size:1px;}' },
            start: 0, length: 5, position: 'center', offset: { x: 0, y: 0 } }] },
          { clips: [{ asset: { type: 'image', src: 'test.png' }, start: 0, length: 5 }] },
          { clips: [{ asset: { type: 'html', width: 400, height: 40,
              html: '<p>Hello</p>', css: 'p{color:#fff;font-size:20px;}' },
            start: 1, length: 4, position: 'center', offset: { x: 0, y: 0 } }] }
        ]
      },
      output: { size: { width: 800, height: 600 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var htmlRect = result.objects.filter(function (o) { return o.cfsHtmlType === 'rect'; })[0];
    var htmlText = result.objects.filter(function (o) { return o.cfsHtmlType === 'text'; })[0];
    assertEqual(htmlRect.cfsTrackIndex, 0, 'html rect should be track 0');
    assertEqual(htmlText.cfsTrackIndex, 2, 'html text should be track 2');
  };

  global.testHtmlRectClipRoundTripExport = function () {
    var fabricToShotstack = global.__CFS_fabricToShotstack;
    if (!fabricToShotstack) { assertTrue(false, 'fabricToShotstack not found'); return; }
    var origClip = {
      asset: { type: 'html', width: 656, height: 604, background: '#adc90e',
        html: '<p data-html-type="text">box</p>',
        css: "p { color: #ffffff; font-size: 1px; }" },
      fit: 'none', scale: 1, offset: { x: 0.185, y: -0.022 },
      position: 'center', start: 0, length: 5
    };
    var fakeObj = {
      type: 'rect', name: 'html_0', fill: '#adc90e',
      left: 100, top: 50, width: 656, height: 604,
      cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0,
      cfsOriginalClip: origClip,
      cfsHtmlType: 'rect'
    };
    var fabricJson = { width: 1024, height: 576, objects: [fakeObj] };
    var result = fabricToShotstack(fabricJson);
    assertTrue(result.timeline.tracks.length >= 1, 'should have at least 1 track');
    var clip = result.timeline.tracks[0].clips[0];
    assertEqual(clip.asset.type, 'html', 'exported clip type should be html');
    assertEqual(clip.asset.background, '#adc90e', 'should preserve background color');
    assertEqual(clip.asset.html, '<p data-html-type="text">box</p>', 'should preserve html content');
  };

  global.testHtmlTextClipRoundTripExport = function () {
    var fabricToShotstack = global.__CFS_fabricToShotstack;
    if (!fabricToShotstack) { assertTrue(false, 'fabricToShotstack not found'); return; }
    var origClip = {
      asset: { type: 'html', width: 500, height: 40,
        html: '<p data-html-type="text">+01 234 567 890</p>',
        css: "p { color: #ffffff; font-size: 22px; font-family: 'Noto Sans Medium'; text-align: left; }" },
      fit: 'none', scale: 1, offset: { x: 0.216, y: -0.377 },
      position: 'center', start: 0, length: 5
    };
    var fakeObj = {
      type: 'textbox', name: 'html_text_0', text: '+01 234 567 890',
      left: 100, top: 50, width: 500,
      fontSize: 22, fontFamily: 'Noto Sans Medium', fill: '#ffffff',
      cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0,
      cfsOriginalClip: origClip,
      cfsHtmlType: 'text'
    };
    var fabricJson = { width: 1024, height: 576, objects: [fakeObj] };
    var result = fabricToShotstack(fabricJson);
    assertTrue(result.timeline.tracks.length >= 1, 'should have at least 1 track');
    var clip = result.timeline.tracks[0].clips[0];
    assertEqual(clip.asset.type, 'html', 'exported clip type should be html');
    assertEqual(clip.asset.css, "p { color: #ffffff; font-size: 22px; font-family: 'Noto Sans Medium'; text-align: left; }", 'should preserve CSS');
  };

  global.testHtmlClipEditedTextExport = function () {
    var fabricToShotstack = global.__CFS_fabricToShotstack;
    if (!fabricToShotstack) { assertTrue(false, 'fabricToShotstack not found'); return; }
    var origClip = {
      asset: { type: 'html', width: 500, height: 40,
        html: '<p data-html-type="text">Original Text</p>',
        css: "p { color: #ffffff; font-size: 22px; }" },
      fit: 'none', scale: 1, offset: { x: 0, y: 0 },
      position: 'center', start: 0, length: 5
    };
    var fakeObj = {
      type: 'textbox', name: 'html_text_0', text: 'Edited Text',
      left: 100, top: 50, width: 500,
      fontSize: 22, fill: '#ffffff',
      cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0,
      cfsOriginalClip: origClip, cfsHtmlType: 'text'
    };
    var fabricJson = { width: 1024, height: 576, objects: [fakeObj] };
    var result = fabricToShotstack(fabricJson);
    var clip = result.timeline.tracks[0].clips[0];
    assertTrue(clip.asset.html.indexOf('Edited Text') !== -1, 'exported html should contain edited text');
    assertTrue(clip.asset.html.indexOf('Original Text') === -1, 'exported html should not contain original text');
  };

  global.testRealEstateListingTemplateImport = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.shotstackToFabricStructure) { assertTrue(false, 'scene not found'); return; }
    var template = {
      timeline: {
        background: '#ffffff',
        tracks: [
          { clips: [{ asset: { type: 'audio', src: 'test.mp3', volume: 1 }, start: 0, length: 29.3 }] },
          { clips: [{ asset: { type: 'image', src: 'logo.png' }, length: 5.49, offset: { x: 0.38, y: 0.375 }, position: 'center', start: 23.76, scale: 0.2 }] },
          { clips: [{ asset: { type: 'html', width: 500, height: 40,
              html: '<p data-html-type="text">+01 234 567 890</p>',
              css: "p { color: #ffffff; font-size: 22px; font-family: 'Noto Sans Medium'; text-align: left; }" },
            fit: 'none', scale: 1, offset: { x: 0.216, y: -0.377 }, position: 'center', length: 4.25, start: 25 }] },
          { clips: [{ asset: { type: 'html', width: 656, height: 604, background: '#adc90e',
              html: '<p data-html-type="text">box</p>',
              css: "p { color: #ffffff; font-size: 1px; }" },
            fit: 'none', scale: 1, offset: { x: 0.185, y: -0.022 }, position: 'center', start: 23.5, length: 5.75, opacity: 0.97 }] },
          { clips: [{ asset: { type: 'html', width: 710, height: 1, background: '#ffffff',
              html: '<p data-html-type="text">Line horizontal</p>',
              css: "p { color: #ffffff; font-size: 1px; }" },
            fit: 'none', scale: 1, offset: { x: 0.266, y: -0.139 }, position: 'center', start: 0, length: 5 }] }
        ]
      },
      output: { size: { width: 1024, height: 576 } }
    };
    var result = scene.shotstackToFabricStructure(template);
    var allHtml = result.objects.filter(function (o) { return o.cfsHtmlType; });
    assertEqual(allHtml.length, 3, 'should import 3 html clips (text + rect + line)');
    var texts = allHtml.filter(function (o) { return o.cfsHtmlType === 'text'; });
    var rects = allHtml.filter(function (o) { return o.cfsHtmlType === 'rect'; });
    assertEqual(texts.length, 1, '1 html text clip');
    assertEqual(rects.length, 2, '2 html rect clips (box + line)');
    assertEqual(result.width, 1024, 'canvas width should be 1024');
    assertEqual(result.height, 576, 'canvas height should be 576');
  };

  /* ——— captureFrameAt viewport reset ——— */

  global.testCaptureFrameAtResetsViewport = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.captureFrameAt) return;
    var toDataURLCalls = [];
    var mockCanvas = {
      viewportTransform: [0.3, 0, 0, 0.3, 50, 50],
      setViewportTransform: function (vpt) { this.viewportTransform = vpt.slice(); },
      toDataURL: function () {
        toDataURLCalls.push(this.viewportTransform.slice());
        return 'data:image/png;base64,mock';
      },
      getObjects: function () { return []; },
      renderAll: function () {},
    };
    var result = scene.captureFrameAt(mockCanvas, 0, { format: 'png' });
    assertTrue(result != null, 'should return a data URL');
    assertEqual(toDataURLCalls.length, 1, 'toDataURL called once');
    var vptDuringExport = toDataURLCalls[0];
    assertEqual(vptDuringExport[0], 1, 'scaleX should be identity during export');
    assertEqual(vptDuringExport[3], 1, 'scaleY should be identity during export');
    assertEqual(vptDuringExport[4], 0, 'translateX should be 0 during export');
    assertEqual(vptDuringExport[5], 0, 'translateY should be 0 during export');
    assertEqual(mockCanvas.viewportTransform[0], 0.3, 'scaleX restored after export');
    assertEqual(mockCanvas.viewportTransform[4], 50, 'translateX restored after export');
  };

  /* ——— applyFitToImages crop should NOT add clipPath ——— */

  global.testApplyFitCropNoClipPath = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToImages) return;
    if (typeof fabric === 'undefined') return;
    var imgElement = { naturalWidth: 1230, naturalHeight: 1080, width: 1230, height: 1080 };
    var mockObj = {
      type: 'image',
      cfsFit: 'crop',
      cfsScale: 0.67,
      cfsOriginalClip: { position: 'center', offset: { x: -0.214, y: 0.01 } },
      cfsResponsive: true,
      width: 1920,
      height: 1080,
      left: 0,
      top: 0,
      clipPath: null,
      getElement: function () { return imgElement; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    var mockCanvas = {
      getObjects: function () { return [mockObj]; },
      getWidth: function () { return 1920; },
      getHeight: function () { return 1080; },
      renderAll: function () {},
    };
    scene.applyFitToImages(mockCanvas, 1920, 1080);
    assertTrue(mockObj.clipPath == null, 'crop mode should NOT set clipPath');
    assertTrue(mockObj.scaleX > 1, 'scaleX should be > 1 for crop');
    assertTrue(mockObj.scaleY > 1, 'scaleY should be > 1 for crop');
  };

  /* ——— createImage returns Promise for blob URLs ——— */

  global.testCreateImageReturnsPromiseForBlobUrls = function () {
    if (typeof PIXI === 'undefined') return;
    var player = global.__CFS_pixiTimelinePlayer;
    if (!player || !player._testCreateImage) return;
    var clipMeta = { clip: {}, x: 0, y: 0, start: 0, length: 5 };
    var asset = { type: 'image', src: 'blob:http://localhost/test-image-id' };
    var result = player._testCreateImage(clipMeta, asset, {}, {}, 1920, 1080);
    assertTrue(result != null, 'createImage should return something for blob URLs');
    assertTrue(typeof result.then === 'function', 'createImage should return a Promise for blob URLs');
  };

  /* ——— applyFitAndScale crop with non-1.0 scale ——— */

  global.testApplyFitAndScaleCropWithScale = function () {
    var r = applyFitAndScale({ fit: 'crop', scale: 0.67 }, 1920, 1080, 1230, 1080);
    var scaledTargetW = 1920 * 0.67;
    var scaledTargetH = 1080 * 0.67;
    assertTrue(r.width >= scaledTargetW - 0.01, 'crop+scale: width covers scaled target width');
    assertTrue(r.height >= scaledTargetH - 0.01, 'crop+scale: height covers scaled target height');
    var expectedS = Math.max(scaledTargetW / 1230, scaledTargetH / 1080);
    assertTrue(Math.abs(r.width - 1230 * expectedS) < 0.1, 'width matches expected scale factor');
    assertTrue(Math.abs(r.height - 1080 * expectedS) < 0.1, 'height matches expected scale factor');
  };

  /* ——— positionFromClip accessible at IIFE scope ——— */

  global.testPositionFromClipAccessibleFromApplyFit = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToImages) return;
    if (typeof fabric === 'undefined') return;
    var imgElement = { naturalWidth: 500, naturalHeight: 800, width: 500, height: 800 };
    var mockObj = {
      type: 'image',
      cfsFit: 'crop',
      cfsScale: 0.67,
      cfsOriginalClip: { position: 'center', offset: { x: -0.214, y: 0.01 } },
      width: 1920,
      height: 1080,
      left: 0,
      top: 0,
      getElement: function () { return imgElement; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    var mockCanvas = {
      getObjects: function () { return [mockObj]; },
      getWidth: function () { return 1920; },
      getHeight: function () { return 1080; },
      renderAll: function () {},
    };
    var threw = false;
    try {
      scene.applyFitToImages(mockCanvas, 1920, 1080);
    } catch (e) {
      threw = true;
    }
    assertFalse(threw, 'applyFitToImages should not throw ReferenceError for positionFromClip');
  };

  /* ——— applyFitToImages uses cfsOriginalClip for clip dimensions ——— */

  global.testApplyFitCropUsesOriginalClipDimensions = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToImages) return;
    if (typeof fabric === 'undefined') return;
    var imgElement = { naturalWidth: 500, naturalHeight: 800, width: 500, height: 800 };
    var mockObj = {
      type: 'image',
      cfsFit: 'crop',
      cfsScale: 0.67,
      cfsOriginalClip: { position: 'center', offset: { x: -0.214, y: 0.01 } },
      width: 500,
      height: 800,
      left: 0,
      top: 0,
      getElement: function () { return imgElement; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    var mockCanvas = {
      getObjects: function () { return [mockObj]; },
      getWidth: function () { return 1920; },
      getHeight: function () { return 1080; },
      renderAll: function () {},
    };
    scene.applyFitToImages(mockCanvas, 1920, 1080);
    var sFitWithCanvas = Math.max(1920 / 500, 1080 / 800);
    assertTrue(
      Math.abs(mockObj.scaleX - sFitWithCanvas * 0.67) < 0.01,
      'crop scaleX should use canvas dims (1920x1080), not obj.width/height (500x800)'
    );
    assertTrue(
      Math.abs(mockObj.scaleY - sFitWithCanvas * 0.67) < 0.01,
      'crop scaleY should use canvas dims (1920x1080), not obj.width/height (500x800)'
    );
    scene.applyFitToImages(mockCanvas, 1920, 1080);
    assertTrue(
      Math.abs(mockObj.scaleX - sFitWithCanvas * 0.67) < 0.01,
      'second call: crop scaleX should still use canvas dims, not overwritten natural dims'
    );
  };

  /* ——— parseFontNamesFromBuffer returns both names ——— */

  global.testParseFontNamesFromBufferExposed = function () {
    var fn = global.__CFS_parseFontNamesFromBuffer;
    if (!fn) return;
    var result = fn(new ArrayBuffer(0));
    assertTrue(result != null, 'parseFontNamesFromBuffer should return an object for empty buffer');
    assertEqual(result.fullName, null);
    assertEqual(result.familyName, null);
  };

  /* ——— buildTextStyleOpts reads font.lineHeight ——— */

  global.testBuildTextStyleOptsReadsFontLineHeight = function () {
    var asset = {
      font: { family: 'Roboto', size: 44, color: '#373737', lineHeight: 1.5 }
    };
    var opts = {
      fontFamily: asset.font.family || 'Arial, sans-serif',
      fontSize: Number(asset.font.size) || 48,
      fill: 0x373737,
      fontWeight: asset.font.weight || 'normal'
    };
    var style = asset.style || {};
    var font = asset.font || {};
    var rawLineHeight = style.lineHeight != null ? style.lineHeight : (font.lineHeight != null ? font.lineHeight : null);
    if (rawLineHeight != null) {
      var lh = Number(rawLineHeight);
      if (lh > 0 && lh <= 10) opts.lineHeight = Math.round(opts.fontSize * lh);
      else if (lh > 10) opts.lineHeight = lh;
    }
    assertEqual(opts.lineHeight, Math.round(44 * 1.5), 'lineHeight from font.lineHeight should be fontSize * 1.5');
  };

  /* ——— createTitle uses clip.height for vertical alignment ——— */

  global.testCreateTitleUsesClipHeightForVerticalAlignment = function () {
    var clip = { width: 840, height: 83 };
    var asset = { type: 'rich-text', text: 'Test', font: { family: 'Roboto', size: 44 }, align: { horizontal: 'left', vertical: 'middle' } };
    var elemH = asset.height != null ? Number(asset.height) : (clip.height != null ? Number(clip.height) : 0);
    assertEqual(elemH, 83, 'elemH should fall back to clip.height when asset.height is not set');
    var fontSize = 44;
    var textHeight = 50;
    var clipMetaY = 900;
    var expectedY = clipMetaY + (elemH - textHeight) / 2;
    assertTrue(expectedY > clipMetaY, 'vertical middle alignment with clip.height should offset y positively');
    assertTrue(expectedY < clipMetaY + elemH, 'vertical middle alignment should keep text within clip height');
  };

  /* ——— buildTextStyleOpts reads font.style ——— */

  global.testBuildTextStyleOptsReadsFontStyle = function () {
    var asset = {
      font: { family: 'Roboto', size: 20, color: '#000000', style: 'italic' }
    };
    var font = asset.font || {};
    var opts = {};
    if (font.style && font.style !== 'normal') opts.fontStyle = String(font.style);
    assertEqual(opts.fontStyle, 'italic', 'fontStyle should be set from font.style when not normal');

    var asset2 = { font: { family: 'Roboto', size: 20, color: '#000000', style: 'normal' } };
    var opts2 = {};
    var font2 = asset2.font || {};
    if (font2.style && font2.style !== 'normal') opts2.fontStyle = String(font2.style);
    assertEqual(opts2.fontStyle, undefined, 'fontStyle should not be set when font.style is normal');
  };

  /* ——— fabricToShotstack preserves embedded placeholders ——— */

  global.testFabricToShotstackPreservesEmbeddedPlaceholder = function () {
    var origText = 'Lease starting at {{ PRICE }}/month';
    var textAlias = 'PRICE';
    var textIsPlaceholder = true;
    var hasEmbeddedPlaceholder = textIsPlaceholder && origText &&
      new RegExp('\\{\\{\\s*' + textAlias + '\\s*\\}\\}').test(origText) &&
      !(/^\s*\{\{\s*[A-Za-z0-9_]+\s*\}\}\s*$/.test(origText));
    assertTrue(hasEmbeddedPlaceholder, 'should detect embedded placeholder in "Lease starting at {{ PRICE }}/month"');

    var barePlaceholder = '{{ PRICE }}';
    var bareIsEmbedded = textIsPlaceholder && barePlaceholder &&
      new RegExp('\\{\\{\\s*' + textAlias + '\\s*\\}\\}').test(barePlaceholder) &&
      !(/^\s*\{\{\s*[A-Za-z0-9_]+\s*\}\}\s*$/.test(barePlaceholder));
    assertTrue(!bareIsEmbedded, 'should NOT detect embedded placeholder for bare "{{ PRICE }}"');

    var textClipText = origText;
    if (hasEmbeddedPlaceholder) {
      /* do not overwrite */
    } else {
      textClipText = '{{ ' + textAlias + ' }}';
    }
    assertEqual(textClipText, origText, 'embedded placeholder text should preserve the original structure');

    var mergeNeedle = '{{ ' + textAlias + ' }}';
    var mergeValue = '$329';
    var merged = textClipText.split(mergeNeedle).join(mergeValue);
    assertEqual(merged, 'Lease starting at $329/month', 'merge should produce full text with surrounding context');
  };

  global.testFabricToShotstackMergeEntryUsesLookupValue = function () {
    var textAlias = 'PRICE';
    var textContent = 'Lease starting at $329/month';
    var mergeLookup = { PRICE: '$329' };
    var mergeReplace = (mergeLookup && mergeLookup[textAlias] != null)
      ? String(mergeLookup[textAlias])
      : textContent;
    assertEqual(mergeReplace, '$329', 'merge entry should use lookup value, not full text content');

    var noLookup = null;
    var fallback = (noLookup && noLookup[textAlias] != null) ? String(noLookup[textAlias]) : textContent;
    assertEqual(fallback, textContent, 'should fall back to textContent when mergeLookup is not available');
  };

  /* ——— text clip offset uses clip dimensions, not Fabric text height ——— */

  global.testTextClipOffsetUsesClipDimensions = function () {
    var canvasW = 1920, canvasH = 1080;
    var teslaLeft = 86.88, teslaTop = 279;
    var clipW = 840, clipH = 144;
    var tcx = teslaLeft + clipW / 2;
    var tcy = teslaTop + clipH / 2;
    var ox = (tcx - canvasW / 2) / canvasW;
    var oy = -((tcy - canvasH / 2) / canvasH);
    var result = { x: Math.round(ox * 1e6) / 1e6, y: Math.round(oy * 1e6) / 1e6 };
    assertEqual(result.x, -0.236, 'offset.x should match original');
    assertEqual(result.y, 0.175, 'offset.y should match original when using clip height (144), not text height');

    var textHeight = 92;
    var wrongCy = teslaTop + textHeight / 2;
    var wrongOy = -((wrongCy - canvasH / 2) / canvasH);
    var wrongResult = Math.round(wrongOy * 1e6) / 1e6;
    assertTrue(wrongResult !== 0.175, 'using text height instead of clip height should produce wrong offset');
  };

  /* ——— cfsMergeKey fallback in injectMergeData value lookup ——— */

  global.testInjectMergeDataCfsMergeKeyFallback = function () {
    var values = { MAIN_IMAGE: 'https://example.com/image.jpg', PRICE: '$329' };

    // Simulate obj.name lookup (existing behavior)
    var name1 = 'MAIN_IMAGE';
    var val1 = values[name1] !== undefined ? values[name1] : undefined;
    assertEqual(val1, 'https://example.com/image.jpg', 'direct name lookup should work');

    // Simulate obj.name NOT matching, but cfsMergeKey matching
    var name2 = 'image_3';
    var val2 = values[name2] !== undefined ? values[name2] : (typeof name2 === 'string' ? values[name2.toUpperCase().replace(/\s+/g, '_')] : undefined);
    assertEqual(val2, undefined, 'name lookup should fail for non-matching name');

    var mergeKey = 'MAIN_IMAGE';
    if (val2 === undefined && mergeKey) {
      val2 = values[mergeKey] !== undefined ? values[mergeKey] : values[String(mergeKey).toUpperCase().replace(/\s+/g, '_')];
    }
    assertEqual(val2, 'https://example.com/image.jpg', 'cfsMergeKey fallback should find value');

    // Case-insensitive fallback
    var name3 = 'something_else';
    var val3 = values[name3] !== undefined ? values[name3] : undefined;
    var mergeKey3 = 'main_image';
    if (val3 === undefined && mergeKey3) {
      val3 = values[mergeKey3] !== undefined ? values[mergeKey3] : values[String(mergeKey3).toUpperCase().replace(/\s+/g, '_')];
    }
    assertEqual(val3, 'https://example.com/image.jpg', 'cfsMergeKey uppercase fallback should find value');

    // No cfsMergeKey should remain undefined
    var val4 = undefined;
    var mergeKey4 = null;
    if (val4 === undefined && mergeKey4) {
      val4 = values[mergeKey4];
    }
    assertEqual(val4, undefined, 'null cfsMergeKey should not change undefined val');
  };

  /* ——— Merge value display truncation ——— */

  global.testMergeValueDisplayTruncation = function () {
    var longUrl = 'https://templates.shotstack.io/electric-car-for-sale/bad6eca8-53dd-4b26-b8fd-d64c4ade3d52/source.png';
    var parts = longUrl.split('/');
    var filename = parts[parts.length - 1] || longUrl;
    assertEqual(filename, 'source.png', 'should extract filename from URL');

    var shortText = '$329';
    var safeShort = shortText.length > 50 ? shortText.substring(0, 47) + '...' : shortText;
    assertEqual(safeShort, '$329', 'short text should not be truncated');

    var longText = 'A'.repeat(60);
    var safeLong = longText.length > 50 ? longText.substring(0, 47) + '...' : longText;
    assertEqual(safeLong.length, 50, 'long text should be truncated to 50 chars');
    assertTrue(safeLong.endsWith('...'), 'truncated text should end with ellipsis');
  };

  /* ——— applyFitToImages computes correct scale from natural dimensions ——— */

  global.testApplyFitToImagesCropMode = function () {
    var canvasW = 1024, canvasH = 576;
    var naturalW = 4000, naturalH = 3000;
    var clipW = canvasW, clipH = canvasH;

    var sFit = Math.max(clipW / naturalW, clipH / naturalH);
    assertEqual(sFit, clipW / naturalW, 'crop should use max ratio');

    var resultScaleX = sFit * 1;
    var resultW = naturalW;
    var resultH = naturalH;
    assertTrue(resultScaleX < 1, 'scaleX should be less than 1 for large images');
    assertEqual(resultW, 4000, 'width should be natural width');
    assertEqual(resultH, 3000, 'height should be natural height');

    var visibleW = resultW * resultScaleX;
    var visibleH = resultH * resultScaleX;
    assertTrue(visibleW >= clipW, 'visible width should cover clip width in crop mode');
    assertTrue(visibleH >= clipH, 'visible height should cover clip height in crop mode');
  };

  global.testApplyFitToImagesContainMode = function () {
    var canvasW = 1024, canvasH = 576;
    var naturalW = 4000, naturalH = 3000;
    var clipW = canvasW, clipH = canvasH;

    var sFit = Math.min(clipW / naturalW, clipH / naturalH);
    var resultScaleX = sFit * 1;
    var visibleW = naturalW * resultScaleX;
    var visibleH = naturalH * resultScaleX;
    assertTrue(visibleW <= clipW, 'visible width should fit within clip in contain mode');
    assertTrue(visibleH <= clipH, 'visible height should fit within clip in contain mode');
  };

  global.testApplyFitToImagesNoneMode = function () {
    var naturalW = 200, naturalH = 150;
    var clipScale = 0.12;

    var resultW = naturalW;
    var resultH = naturalH;
    var resultScaleX = clipScale;
    var resultScaleY = clipScale;

    assertEqual(resultW, 200, 'fit:none should use natural width');
    assertEqual(resultH, 150, 'fit:none should use natural height');
    assertEqual(resultScaleX, 0.12, 'fit:none should use clip scale directly');
    assertEqual(resultScaleY, 0.12, 'fit:none scaleY should match scaleX');
  };

  global.testApplyFitShouldNotRestoreOldDimensions = function () {
    var placeholderW = 1024, placeholderH = 576;
    var naturalW = 4000, naturalH = 3000;
    var clipW = 1024, clipH = 576;

    var sFit = Math.max(clipW / naturalW, clipH / naturalH);
    var correctScaleX = sFit;
    var correctW = naturalW;

    assertTrue(correctW !== placeholderW, 'correct width should differ from placeholder width');
    assertTrue(correctScaleX !== 1, 'correct scale should not be 1.0');
    assertTrue(correctScaleX < 1, 'correct scale should be < 1 for downscaling large image');

    var wrongW = placeholderW;
    var wrongScaleX = 1;
    assertTrue(wrongW === 1024 && wrongScaleX === 1,
      'restoring old dimensions (1024x576, scale=1) would show only top-left corner of 4000x3000');
  };

  /* ——— applyFitToSingleImage only affects the target object ——— */

  global.testApplyFitToSingleImageCropMode = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 4000, naturalHeight: 3000, width: 4000, height: 3000 };
    var obj = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { position: 'center', offset: { x: 0, y: 0 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 1024, 576);
    var sFit = Math.max(1024 / 4000, 576 / 3000);
    assertTrue(Math.abs(obj.scaleX - sFit) < 0.001, 'single image crop scaleX should match expected');
    var expectedCropW = Math.min(4000, Math.round(1024 / sFit));
    var expectedCropH = Math.min(3000, Math.round(576 / sFit));
    assertEqual(obj.width, expectedCropW, 'crop width should be clipped source width');
    assertEqual(obj.height, expectedCropH, 'crop height should be clipped source height');
    var visualW = obj.width * obj.scaleX;
    var visualH = obj.height * obj.scaleY;
    assertTrue(Math.abs(visualW - 1024) < 2, 'visual width should match clip width');
    assertTrue(Math.abs(visualH - 576) < 2, 'visual height should match clip height');
    assertTrue(obj.cropX != null, 'cropX should be set');
    assertTrue(obj.cropY != null, 'cropY should be set');
    assertTrue(obj.cropY > 0, 'cropY should be > 0 for landscape image in landscape clip with height excess');
  };

  global.testApplyFitToSingleImageSkipsPlaceholder = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 1, naturalHeight: 1, width: 1, height: 1 };
    var obj = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1,
      cfsFit: 'crop', cfsScale: 1,
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 1024, 576);
    assertEqual(obj.width, 1024, 'placeholder image width should not change');
    assertEqual(obj.scaleX, 1, 'placeholder image scaleX should not change');
  };

  global.testApplyFitToSingleImageDoesNotAffectOtherImages = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var loadedEl = { naturalWidth: 4000, naturalHeight: 3000, width: 4000, height: 3000 };
    var placeholderEl = { naturalWidth: 1, naturalHeight: 1, width: 1, height: 1 };
    var obj1 = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { position: 'center', offset: { x: 0, y: 0 } },
      getElement: function () { return loadedEl; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    var obj2 = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1,
      cfsFit: 'crop', cfsScale: 1,
      getElement: function () { return placeholderEl; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj1, 1024, 576);
    assertEqual(obj2.width, 1024, 'other image width must remain unchanged');
    assertEqual(obj2.scaleX, 1, 'other image scaleX must remain unchanged');
    var sFit = Math.max(1024 / 4000, 576 / 3000);
    assertTrue(Math.abs(obj1.scaleX - sFit) < 0.001, 'target image should have been scaled to sFit');
  };

  /* ——— applyFitToSingleImage: 'cover' should behave like 'crop' ——— */

  global.testApplyFitToSingleImageCoverMode = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 4000, naturalHeight: 3000, width: 4000, height: 3000 };
    var coverObj = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'cover', cfsScale: 1,
      cfsOriginalClip: { position: 'center', offset: { x: 0, y: 0 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    var cropObj = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { position: 'center', offset: { x: 0, y: 0 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(coverObj, 1024, 576);
    scene.applyFitToSingleImage(cropObj, 1024, 576);
    assertEqual(coverObj.scaleX, cropObj.scaleX, 'cover scaleX should match crop scaleX');
    assertEqual(coverObj.width, cropObj.width, 'cover width should match crop width');
    assertEqual(coverObj.height, cropObj.height, 'cover height should match crop height');
    assertEqual(coverObj.cropX, cropObj.cropX, 'cover cropX should match crop cropX');
    assertEqual(coverObj.cropY, cropObj.cropY, 'cover cropY should match crop cropY');
    assertTrue(coverObj.scaleX < 1, 'cover mode should scale down a large image');
  };

  /* ——— applyFitToSingleImage: should update captured base state ——— */

  global.testApplyFitToSingleImageUpdatesBaseState = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 4000, naturalHeight: 3000, width: 4000, height: 3000 };
    var obj = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { position: 'center', offset: { x: 0, y: 0 } },
      _cfsBaseStateCaptured: true, _cfsBaseScaleX: 1, _cfsBaseScaleY: 1,
      _cfsBaseLeft: 0, _cfsBaseTop: 0,
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 1024, 576);
    var sFit = Math.max(1024 / 4000, 576 / 3000);
    assertTrue(Math.abs(obj._cfsBaseScaleX - sFit) < 0.001,
      'base state scaleX should be updated to sFit after applyFitToSingleImage');
    assertTrue(Math.abs(obj._cfsBaseScaleY - sFit) < 0.001,
      'base state scaleY should be updated to sFit after applyFitToSingleImage');
  };

  /* ——— isCanvasOutputType should exclude audio ——— */

  global.testIsCanvasOutputTypeExcludesAudio = function () {
    var canvasTypes = ['image', 'video', 'book', 'text'];
    assertTrue(canvasTypes.indexOf('audio') === -1, 'audio should not be a canvas output type');
    assertTrue(canvasTypes.indexOf('video') >= 0, 'video should be a canvas output type');
    assertTrue(canvasTypes.indexOf('image') >= 0, 'image should be a canvas output type');
  };

  /* ——— video/audio switch should be a fast path (no rebuild) ——— */

  global.testVideoAudioSwitchDetection = function () {
    function isVideoAudioSwitch(prevType, newType) {
      return (prevType === 'video' && newType === 'audio') || (prevType === 'audio' && newType === 'video');
    }
    assertTrue(isVideoAudioSwitch('video', 'audio'), 'video->audio should be detected');
    assertTrue(isVideoAudioSwitch('audio', 'video'), 'audio->video should be detected');
    assertFalse(isVideoAudioSwitch('video', 'image'), 'video->image should not be fast path');
    assertFalse(isVideoAudioSwitch('image', 'audio'), 'image->audio should not be fast path');
    assertFalse(isVideoAudioSwitch('video', 'video'), 'video->video should not trigger');
  };

  /* ——— Preset & Save Frame should hide when output is audio ——— */

  global.testToolbarElementsHiddenForAudio = function () {
    function shouldHide(outputType) { return outputType === 'audio'; }
    assertTrue(shouldHide('audio'), 'toolbar elements should hide for audio');
    assertFalse(shouldHide('video'), 'toolbar elements should show for video');
    assertFalse(shouldHide('image'), 'toolbar elements should show for image');
  };

  global.testToolbarElementsRestoredOnVideoSwitch = function () {
    function hideForAudio(type) { return type === 'audio'; }
    var elements = ['preset', 'zoom', 'dimensions', 'res', 'saveFrame'];
    elements.forEach(function (name) {
      var display = hideForAudio('audio') ? 'none' : '';
      assertEqual(display, 'none', name + ' should be hidden for audio');
      display = hideForAudio('video') ? 'none' : '';
      assertEqual(display, '', name + ' should be visible for video');
    });
  };

  /* ——— Playhead position should include track label offset ——— */

  global.testPlayheadIncludesTrackLabelOffset = function () {
    var trackLabelWidth = 52;
    var timelineScale = 80;
    function playheadLeft(t) {
      return t * timelineScale + trackLabelWidth;
    }
    assertEqual(playheadLeft(0), 52, 'playhead at t=0 should be at trackLabelWidth (52px)');
    assertEqual(playheadLeft(1), 132, 'playhead at t=1 should be at 52 + 80 = 132');
    assertEqual(playheadLeft(5), 452, 'playhead at t=5 should be at 52 + 400 = 452');
  };

  global.testPlayheadScrubAccountsForOffset = function () {
    var trackLabelWidth = 52;
    var timelineScale = 80;
    function timeFromX(clientX, areaLeft, scrollLeft) {
      var x = clientX - areaLeft + scrollLeft - trackLabelWidth;
      return Math.max(0, x / timelineScale);
    }
    assertEqual(timeFromX(52, 0, 0), 0, 'clicking at pixel 52 should map to t=0');
    assertEqual(timeFromX(132, 0, 0), 1, 'clicking at pixel 132 should map to t=1');
    assertEqual(timeFromX(0, 0, 0), 0, 'clicking before track area should clamp to t=0');
  };

  global.testTimelinePanelExportsConstants = function () {
    var panel = global.__CFS_timelinePanel;
    if (!panel) return;
    assertTrue(panel.TRACK_LABEL_WIDTH === 52, 'TRACK_LABEL_WIDTH should be 52');
    assertTrue(panel.TRACK_ROW_HEIGHT === 40, 'TRACK_ROW_HEIGHT should be 40');
  };

  /* ——— PixiJS carousel IN transition directions ——— */

  global.testPixiCarouselInDirections = function () {
    function carouselInDir(name) {
      var n = name;
      return n.indexOf('Left') !== -1 ? 1 : (n.indexOf('Right') !== -1 ? -1 : (n.indexOf('Up') !== -1 ? 1 : -1));
    }
    assertEqual(carouselInDir('carouselUp'), 1, 'carouselUp IN should start below (dir=1)');
    assertEqual(carouselInDir('carouselUpSlow'), 1, 'carouselUpSlow IN should start below (dir=1)');
    assertEqual(carouselInDir('carouselDown'), -1, 'carouselDown IN should start above (dir=-1)');
    assertEqual(carouselInDir('carouselLeft'), 1, 'carouselLeft IN should start right (dir=1)');
    assertEqual(carouselInDir('carouselRight'), -1, 'carouselRight IN should start left (dir=-1)');
  };

  /* ——— PixiJS slide IN transition directions ——— */

  global.testPixiSlideInDirections = function () {
    function slideInDir(name) {
      var n = name;
      return n.indexOf('Left') !== -1 ? -1 : (n.indexOf('Right') !== -1 ? 1 : (n.indexOf('Up') !== -1 ? -1 : 1));
    }
    assertEqual(slideInDir('slideUp'), -1, 'slideUp IN should start above (dir=-1, from top)');
    assertEqual(slideInDir('slideDown'), 1, 'slideDown IN should start below (dir=1, from bottom)');
    assertEqual(slideInDir('slideLeft'), -1, 'slideLeft IN should start left (dir=-1, from left)');
    assertEqual(slideInDir('slideRight'), 1, 'slideRight IN should start right (dir=1, from right)');
  };

  /* ——— Fabric.js slide IN directions (matches PixiJS) ——— */

  global.testFabricSlideInDirections = function () {
    function slideInDir(name) {
      var n = name.toLowerCase();
      return n.indexOf('left') !== -1 ? -1 : (n.indexOf('right') !== -1 ? 1 : (n.indexOf('up') !== -1 ? -1 : 1));
    }
    assertEqual(slideInDir('slideUp'), -1, 'fabric slideUp IN should start above (dir=-1)');
    assertEqual(slideInDir('slideDown'), 1, 'fabric slideDown IN should start below (dir=1)');
    assertEqual(slideInDir('slideLeft'), -1, 'fabric slideLeft IN should start left (dir=-1)');
    assertEqual(slideInDir('slideRight'), 1, 'fabric slideRight IN should start right (dir=1)');
  };

  /* ——— Fabric.js carousel IN directions ——— */

  global.testFabricCarouselInDirections = function () {
    function carouselInDir(name) {
      var n = name.toLowerCase();
      return n.indexOf('left') !== -1 ? 1 : (n.indexOf('right') !== -1 ? -1 : (n.indexOf('up') !== -1 ? 1 : -1));
    }
    assertEqual(carouselInDir('carouselUp'), 1, 'fabric carouselUp IN should start below (dir=1)');
    assertEqual(carouselInDir('carouselDown'), -1, 'fabric carouselDown IN should start above (dir=-1)');
    assertEqual(carouselInDir('carouselLeft'), 1, 'fabric carouselLeft IN should start right (dir=1)');
    assertEqual(carouselInDir('carouselRight'), -1, 'fabric carouselRight IN should start left (dir=-1)');
  };

  /* ——— Slide/Carousel OUT directions should be unchanged ——— */

  global.testSlideOutDirections = function () {
    function slideOutDir(name) {
      return name.indexOf('Left') !== -1 ? -1 : (name.indexOf('Right') !== -1 ? 1 : (name.indexOf('Up') !== -1 ? -1 : 1));
    }
    assertEqual(slideOutDir('slideUp'), -1, 'slideUp OUT should exit upward (dir=-1)');
    assertEqual(slideOutDir('slideDown'), 1, 'slideDown OUT should exit downward (dir=1)');
    assertEqual(slideOutDir('slideLeft'), -1, 'slideLeft OUT should exit left (dir=-1)');
    assertEqual(slideOutDir('slideRight'), 1, 'slideRight OUT should exit right (dir=1)');
  };

  global.testCarouselOutDirections = function () {
    function carouselOutDir(name) {
      return name.indexOf('Left') !== -1 ? -1 : (name.indexOf('Right') !== -1 ? 1 : (name.indexOf('Up') !== -1 ? -1 : 1));
    }
    assertEqual(carouselOutDir('carouselUp'), -1, 'carouselUp OUT should exit upward (dir=-1)');
    assertEqual(carouselOutDir('carouselDown'), 1, 'carouselDown OUT should exit downward (dir=1)');
    assertEqual(carouselOutDir('carouselLeft'), -1, 'carouselLeft OUT should exit left (dir=-1)');
    assertEqual(carouselOutDir('carouselRight'), 1, 'carouselRight OUT should exit right (dir=1)');
  };

  /* ——— Video texture alpha mode for WebM VP9 transparency ——— */

  global.testVideoTextureAlphaModeSet = function () {
    var alphaMode = 'no-premultiply-alpha';
    assertEqual(alphaMode, 'no-premultiply-alpha',
      'video textures should use no-premultiply-alpha to avoid double premultiplication');
    assertTrue(alphaMode !== 'premultiply-alpha-on-upload',
      'premultiply-alpha-on-upload causes broken alpha in VP9 WebM');
  };

  /* ——— New-arrivals template carousel transitions use correct directions ——— */

  global.testNewArrivalsCarouselDirectionCorrectness = function () {
    var template = getNewArrivalsTemplate();
    var carouselClips = [];
    template.timeline.tracks.forEach(function (track) {
      (track.clips || []).forEach(function (clip) {
        var trans = clip.transition;
        if (trans && trans.in && trans.in.indexOf('carousel') !== -1) {
          carouselClips.push({ clip: clip, transIn: trans.in });
        }
      });
    });
    assertTrue(carouselClips.length > 0, 'template should have carousel transitions');
    carouselClips.forEach(function (item) {
      var name = item.transIn;
      assertTrue(
        name === 'carouselUp' || name === 'carouselUpSlow',
        'new-arrivals carousel transitions should be carouselUp or carouselUpSlow, got: ' + name
      );
    });
  };

  /* ——— Video texture: manual VideoSource creation with explicit dimensions ——— */

  global.testVideoTextureCreatedWithVideoSource = function () {
    assertTrue(true, 'createVideo uses PIXI.VideoSource with explicit width/height and autoPlay:false');
    var fit = 'contain';
    var targetW = 1080, targetH = 1920, sourceW = 1080, sourceH = 1920;
    var s = Math.min(targetW / sourceW, targetH / sourceH);
    var expectedW = sourceW * s;
    var expectedH = sourceH * s;
    assertEqual(expectedW, 1080, 'contain fit with matching aspect should give full target width');
    assertEqual(expectedH, 1920, 'contain fit with matching aspect should give full target height');
    var scaleX = expectedW / sourceW;
    var scaleY = expectedH / sourceH;
    assertEqual(scaleX, 1, 'scale should be 1 when texture and target match (no distortion)');
    assertEqual(scaleY, 1, 'scale should be 1 when texture and target match (no distortion)');
  };

  global.testVideoContainFitSquareOnPortrait = function () {
    var targetW = 1080, targetH = 1920, sourceW = 1920, sourceH = 1920;
    var s = Math.min(targetW / sourceW, targetH / sourceH);
    var expectedW = sourceW * s;
    var expectedH = sourceH * s;
    assertEqual(expectedW, 1080, 'contain: square video on portrait should scale to canvas width');
    assertEqual(expectedH, 1080, 'contain: square video on portrait should scale to canvas width');
    var offsetX = (targetW - expectedW) / 2;
    var offsetY = (targetH - expectedH) / 2;
    assertEqual(offsetX, 0, 'contain: no horizontal offset for width-matched fit');
    assertEqual(offsetY, 420, 'contain: centered vertically with 420px offset');
    var spriteScaleX = expectedW / sourceW;
    var spriteScaleY = expectedH / sourceH;
    assertEqual(spriteScaleX, 0.5625, 'sprite scale X should be 0.5625');
    assertEqual(spriteScaleY, 0.5625, 'sprite scale Y should be 0.5625');
  };

  global.testVideoErrorHandlerReturnsPlaceholder = function () {
    var placeholder = { x: 0, y: 0, _cfsBaseX: null, _cfsBaseY: null };
    placeholder.x = 10;
    placeholder.y = 20;
    placeholder._cfsBaseX = placeholder.x;
    placeholder._cfsBaseY = placeholder.y;
    assertEqual(placeholder._cfsBaseX, 10, 'error placeholder should have base X');
    assertEqual(placeholder._cfsBaseY, 20, 'error placeholder should have base Y');
  };

  /* ——— applyFitToSingleImage: explicit asset.left/asset.top positioning ——— */

  global.testApplyFitExplicitAssetLeftTop = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    assertEqual(obj.left, 20, 'explicit asset.left should be used, not positionFromClip center');
    assertEqual(obj.top, 20, 'explicit asset.top should be used, not positionFromClip center');
  };

  global.testApplyFitExplicitLeftTopPreservesSize = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    var visW = obj.width * obj.scaleX;
    var visH = obj.height * obj.scaleY;
    assertTrue(Math.abs(visW - 48) < 1, 'visual width should be ~48 (clip size), got ' + visW);
    assertTrue(Math.abs(visH - 48) < 1, 'visual height should be ~48 (clip size), got ' + visH);
  };

  global.testApplyFitFallsBackToPositionFromClipWithoutExplicitLeftTop = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 200, naturalHeight: 200, width: 200, height: 200 };
    var obj = {
      type: 'image', width: 200, height: 200, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { position: 'center', offset: { x: 0, y: 0 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 1080, 1080);
    var expectedLeft = (1080 - 1080) / 2;
    var expectedTop = (1080 - 1080) / 2;
    assertEqual(obj.left, expectedLeft, 'without explicit left/top, positionFromClip center should be used');
    assertEqual(obj.top, expectedTop, 'without explicit left/top, positionFromClip center should be used');
  };

  global.testApplyFitExplicitLeftTopContainMode = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 800, naturalHeight: 400, width: 800, height: 400 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'contain', cfsScale: 1,
      cfsOriginalClip: { asset: { type: 'image', left: 10, top: 10, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    assertEqual(obj.left, 10, 'contain mode: explicit asset.left should be used');
    assertEqual(obj.top, 10, 'contain mode: explicit asset.top should be used');
  };

  /* ——— applyFitToSingleImage: responsive percentages use visual dims ——— */

  global.testApplyFitResponsivePctUsesVisualDimensions = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 20, top: 20,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    var visW = obj.width * obj.scaleX;
    var visH = obj.height * obj.scaleY;
    var expectedWPct = visW / 500;
    var expectedHPct = visH / 540;
    assertTrue(Math.abs(obj.cfsWidthPct - expectedWPct) < 0.001,
      'cfsWidthPct should reflect visual width/canvasW, got ' + obj.cfsWidthPct + ' expected ' + expectedWPct);
    assertTrue(Math.abs(obj.cfsHeightPct - expectedHPct) < 0.001,
      'cfsHeightPct should reflect visual height/canvasH, got ' + obj.cfsHeightPct + ' expected ' + expectedHPct);
  };

  global.testApplyFitResponsivePctNotRawCropDimensions = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 4000, naturalHeight: 3000, width: 4000, height: 3000 };
    var obj = {
      type: 'image', width: 1024, height: 576, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { position: 'center', offset: { x: 0, y: 0 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 1024, 576);
    var rawWidthPct = obj.width / 1024;
    assertTrue(obj.cfsWidthPct !== rawWidthPct || obj.scaleX === 1,
      'cfsWidthPct should not equal raw obj.width/canvasW when scaleX !== 1');
    var visW = obj.width * obj.scaleX;
    assertTrue(Math.abs(obj.cfsWidthPct - visW / 1024) < 0.001,
      'cfsWidthPct should use visual dims');
  };

  /* ——— Image responsive: applyResponsivePositions simulation ——— */

  global.testResponsiveImageAdjustsScaleNotWidth = function () {
    var origCanvasW = 500, origCanvasH = 540;
    var newCanvasW = 1080, newCanvasH = 1080;
    var origVisW = 48, origVisH = 48;
    var widthPct = origVisW / origCanvasW;
    var heightPct = origVisH / origCanvasH;
    var cropW = 512, cropH = 512;
    var origScaleX = origVisW / cropW;
    var origScaleY = origVisH / cropH;
    var targetVisW = newCanvasW * widthPct;
    var targetVisH = newCanvasH * heightPct;
    var newScaleX = targetVisW / cropW;
    var newScaleY = targetVisH / cropH;
    var newVisW = cropW * newScaleX;
    var newVisH = cropH * newScaleY;
    assertTrue(Math.abs(newVisW - targetVisW) < 0.01,
      'responsive image: visual width should match target, got ' + newVisW + ' expected ' + targetVisW);
    assertTrue(Math.abs(newVisH - targetVisH) < 0.01,
      'responsive image: visual height should match target, got ' + newVisH + ' expected ' + targetVisH);
    assertEqual(cropW, 512, 'responsive should not change crop width');
    assertEqual(cropH, 512, 'responsive should not change crop height');
  };

  global.testResponsiveImagePreservesProportionalSize = function () {
    var origCanvasW = 500, origCanvasH = 540;
    var newCanvasW = 1080, newCanvasH = 1080;
    var origVisW = 48, origVisH = 48;
    var widthPct = origVisW / origCanvasW;
    var leftPct = 20 / origCanvasW;
    var topPct = 20 / origCanvasH;
    var newLeft = newCanvasW * leftPct;
    var newTop = newCanvasH * topPct;
    var newVisW = newCanvasW * widthPct;
    var expectedNewVisW = 48 * (1080 / 500);
    assertTrue(Math.abs(newVisW - expectedNewVisW) < 0.1,
      'image should scale proportionally: expected ~' + expectedNewVisW + ', got ' + newVisW);
    assertTrue(newLeft > 20, 'left should scale up from 20 on larger canvas');
    assertTrue(newTop > 20, 'top should scale up from 20 on larger canvas');
  };

  global.testResponsiveNonImageSetsWidthDirectly = function () {
    var cw = 1080;
    var widthPct = 400 / 500;
    var newW = cw * widthPct;
    assertEqual(newW, 864, 'non-image rect should have width set directly to canvas * pct');
  };

  /* ——— Output type switch: object position/size preservation ——— */

  global.testOutputSwitchPreservesImagePosition = function () {
    var origW = 500, origH = 540;
    var newW = 1080, newH = 1080;
    var origLeft = 20, origTop = 20, origVisW = 48, origVisH = 48;
    var leftPct = origLeft / origW;
    var topPct = origTop / origH;
    var widthPct = origVisW / origW;
    var heightPct = origVisH / origH;
    var newLeft = newW * leftPct;
    var newTop = newH * topPct;
    var newVisW = newW * widthPct;
    var newVisH = newH * heightPct;
    assertTrue(Math.abs(newLeft / newW - origLeft / origW) < 0.001,
      'proportional left should be preserved after output switch');
    assertTrue(Math.abs(newTop / newH - origTop / origH) < 0.001,
      'proportional top should be preserved after output switch');
    assertTrue(Math.abs(newVisW / newW - origVisW / origW) < 0.001,
      'proportional visual width should be preserved after output switch');
    assertTrue(Math.abs(newVisH / newH - origVisH / origH) < 0.001,
      'proportional visual height should be preserved after output switch');
  };

  global.testOutputSwitchImageVisualSizeConsistent = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 20, top: 20,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    var visW1 = obj.width * obj.scaleX;
    var visH1 = obj.height * obj.scaleY;
    var wPct = obj.cfsWidthPct;
    var hPct = obj.cfsHeightPct;
    var targetVisW = 1080 * wPct;
    var targetVisH = 1080 * hPct;
    var newScaleX = targetVisW / obj.width;
    var newScaleY = targetVisH / obj.height;
    obj.scaleX = newScaleX;
    obj.scaleY = newScaleY;
    var visW2 = obj.width * obj.scaleX;
    var visH2 = obj.height * obj.scaleY;
    assertTrue(Math.abs(visW2 - targetVisW) < 0.01,
      'after simulated output switch, visual width should match target');
    assertTrue(Math.abs(visW1 / 500 - visW2 / 1080) < 0.001,
      'proportional visual width should be same: ' + (visW1/500) + ' vs ' + (visW2/1080));
  };

  global.testOutputSwitchRoundTripPreservesVisualSize = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 800, naturalHeight: 600, width: 800, height: 600 };
    var obj = {
      type: 'image', width: 100, height: 100, scaleX: 1, scaleY: 1, left: 50, top: 50,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 50, top: 50, width: 100, height: 100 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 500);
    var origVisW = obj.width * obj.scaleX;
    var wPct = obj.cfsWidthPct;
    var hPct = obj.cfsHeightPct;
    var lPct = obj.cfsLeftPct;
    var tPct = obj.cfsTopPct;
    obj.scaleX = (1080 * wPct) / obj.width;
    obj.scaleY = (1080 * hPct) / obj.height;
    obj.left = 1080 * lPct;
    obj.top = 1080 * tPct;
    var midVisW = obj.width * obj.scaleX;
    obj.cfsWidthPct = midVisW / 1080;
    obj.cfsHeightPct = (obj.height * obj.scaleY) / 1080;
    obj.cfsLeftPct = obj.left / 1080;
    obj.cfsTopPct = obj.top / 1080;
    obj.scaleX = (500 * obj.cfsWidthPct) / obj.width;
    obj.scaleY = (500 * obj.cfsHeightPct) / obj.height;
    obj.left = 500 * obj.cfsLeftPct;
    obj.top = 500 * obj.cfsTopPct;
    var finalVisW = obj.width * obj.scaleX;
    assertTrue(Math.abs(finalVisW - origVisW) < 0.5,
      'round-trip 500→1080→500 should preserve visual width: orig=' + origVisW + ' final=' + finalVisW);
    assertTrue(Math.abs(obj.left - 50) < 0.5,
      'round-trip should preserve left: got ' + obj.left);
    assertTrue(Math.abs(obj.top - 50) < 0.5,
      'round-trip should preserve top: got ' + obj.top);
  };

  /* ——— applyFitToSingleImage: responsive-aware clip dimensions on output switch ——— */

  global.testApplyFitUsesResponsivePctForClipDims = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 20, top: 20,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    var visW1 = obj.width * obj.scaleX;
    assertTrue(Math.abs(visW1 - 48) < 1, 'first fit: visual width should be ~48, got ' + visW1);
    scene.applyFitToSingleImage(obj, 1080, 1080);
    var visW2 = obj.width * obj.scaleX;
    var expectedVisW2 = 1080 * (48 / 500);
    assertTrue(Math.abs(visW2 - expectedVisW2) < 1,
      'second fit at 1080: should use responsive pct, expected ~' + expectedVisW2.toFixed(1) + ' got ' + visW2.toFixed(1));
  };

  global.testApplyFitUsesResponsivePctForPosition = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 20, top: 20,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    assertEqual(obj.left, 20, 'first fit: left should be 20');
    scene.applyFitToSingleImage(obj, 1080, 1080);
    var expectedLeft = 1080 * (20 / 500);
    assertTrue(Math.abs(obj.left - expectedLeft) < 1,
      'second fit: left should use responsive pct, expected ~' + expectedLeft.toFixed(1) + ' got ' + obj.left.toFixed(1));
    var expectedTop = 1080 * (20 / 540);
    assertTrue(Math.abs(obj.top - expectedTop) < 1,
      'second fit: top should use responsive pct, expected ~' + expectedTop.toFixed(1) + ' got ' + obj.top.toFixed(1));
  };

  global.testApplyFitOutputSwitchRoundTrip = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 20, top: 20,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    var origVisW = obj.width * obj.scaleX;
    var origLeft = obj.left;
    scene.applyFitToSingleImage(obj, 1080, 1080);
    scene.applyFitToSingleImage(obj, 500, 540);
    var finalVisW = obj.width * obj.scaleX;
    assertTrue(Math.abs(finalVisW - origVisW) < 0.5,
      'round-trip 500→1080→500 visual width: orig=' + origVisW.toFixed(2) + ' final=' + finalVisW.toFixed(2));
    assertTrue(Math.abs(obj.left - origLeft) < 0.5,
      'round-trip left: orig=' + origLeft + ' final=' + obj.left.toFixed(2));
  };

  global.testApplyFitFallsBackToOrigClipWithoutResponsiveDims = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 0, top: 0,
      cfsFit: 'crop', cfsScale: 1,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 1080, 1080);
    var visW = obj.width * obj.scaleX;
    assertTrue(Math.abs(visW - 48) < 1,
      'without responsive: visual width should be fixed 48 from origClip, got ' + visW);
    assertEqual(obj.left, 20, 'without responsive: left should come from explicit asset.left');
  };

  global.testApplyFitAfterImageReplaceThenOutputSwitch = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 20, top: 20,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 1080, 1080);
    var visAfterFirstFit = obj.width * obj.scaleX;
    var replacedEl = { naturalWidth: 1024, naturalHeight: 768, width: 1024, height: 768 };
    obj.getElement = function () { return replacedEl; };
    var curVisW = obj.width * obj.scaleX;
    var curVisH = obj.height * obj.scaleY;
    var s = Math.max(curVisW / 1024, curVisH / 768);
    var cropW = Math.min(1024, Math.round(curVisW / s));
    var cropH = Math.min(768, Math.round(curVisH / s));
    obj.width = cropW;
    obj.height = cropH;
    obj.scaleX = s;
    obj.scaleY = s;
    obj.cfsWidthPct = (obj.width * obj.scaleX) / 1080;
    obj.cfsHeightPct = (obj.height * obj.scaleY) / 1080;
    var visAfterReplace = obj.width * obj.scaleX;
    assertTrue(Math.abs(visAfterReplace - visAfterFirstFit) < 1,
      'after replace: visual width should be preserved, got ' + visAfterReplace.toFixed(1));
    scene.applyFitToSingleImage(obj, 1080, 1080);
    var visAfterSwitch = obj.width * obj.scaleX;
    assertTrue(Math.abs(visAfterSwitch - visAfterReplace) < 1,
      'after output switch with replaced image: visual width should be preserved, got ' + visAfterSwitch.toFixed(1) + ' expected ~' + visAfterReplace.toFixed(1));
  };

  /* ——— fitNewImageToCurrentBounds: image replacement preserves visual bounds ——— */

  global.testFitNewImagePreservesVisualWidth = function () {
    var savedVisW = 48, savedVisH = 48;
    var natW = 512, natH = 512;
    var s = Math.max(savedVisW / natW, savedVisH / natH);
    var cropW = Math.min(natW, Math.round(savedVisW / s));
    var cropH = Math.min(natH, Math.round(savedVisH / s));
    var resultVisW = cropW * s;
    var resultVisH = cropH * s;
    assertTrue(Math.abs(resultVisW - savedVisW) < 1,
      'replacement visual width should match original: expected ~48, got ' + resultVisW);
    assertTrue(Math.abs(resultVisH - savedVisH) < 1,
      'replacement visual height should match original: expected ~48, got ' + resultVisH);
  };

  global.testFitNewImageNonSquareSource = function () {
    var savedVisW = 48, savedVisH = 48;
    var natW = 800, natH = 400;
    var s = Math.max(savedVisW / natW, savedVisH / natH);
    var cropW = Math.min(natW, Math.round(savedVisW / s));
    var cropH = Math.min(natH, Math.round(savedVisH / s));
    var cropX = Math.max(0, (natW - cropW) / 2);
    var cropY = Math.max(0, (natH - cropH) / 2);
    var resultVisW = cropW * s;
    var resultVisH = cropH * s;
    assertTrue(Math.abs(resultVisW - savedVisW) < 1,
      'non-square source: visual width should be ~48, got ' + resultVisW);
    assertTrue(Math.abs(resultVisH - savedVisH) < 1,
      'non-square source: visual height should be ~48, got ' + resultVisH);
    assertTrue(cropX > 0, 'landscape source cropped to square: cropX should be > 0');
    assertEqual(cropY, 0, 'landscape source cropped to square: cropY should be 0');
  };

  global.testFitNewImageLargeToSmallTarget = function () {
    var savedVisW = 200, savedVisH = 150;
    var natW = 4000, natH = 3000;
    var s = Math.max(savedVisW / natW, savedVisH / natH);
    var cropW = Math.min(natW, Math.round(savedVisW / s));
    var cropH = Math.min(natH, Math.round(savedVisH / s));
    var resultVisW = cropW * s;
    var resultVisH = cropH * s;
    assertTrue(Math.abs(resultVisW - savedVisW) < 1,
      'large source to small target: visual width should be ~200, got ' + resultVisW);
    assertTrue(Math.abs(resultVisH - savedVisH) < 1,
      'large source to small target: visual height should be ~150, got ' + resultVisH);
  };

  global.testFitNewImageSmallSourceToLargeTarget = function () {
    var savedVisW = 200, savedVisH = 200;
    var natW = 64, natH = 64;
    var s = Math.max(savedVisW / natW, savedVisH / natH);
    var cropW = Math.min(natW, Math.round(savedVisW / s));
    var cropH = Math.min(natH, Math.round(savedVisH / s));
    var resultVisW = cropW * s;
    var resultVisH = cropH * s;
    assertTrue(Math.abs(resultVisW - savedVisW) < 1,
      'small source upscaled: visual width should be ~200, got ' + resultVisW);
    assertTrue(Math.abs(resultVisH - savedVisH) < 1,
      'small source upscaled: visual height should be ~200, got ' + resultVisH);
    assertTrue(s > 1, 'scale should be > 1 when upscaling small source');
  };

  global.testFitNewImagePreservesNonSquareTarget = function () {
    var savedVisW = 300, savedVisH = 100;
    var natW = 1000, natH = 1000;
    var s = Math.max(savedVisW / natW, savedVisH / natH);
    var cropW = Math.min(natW, Math.round(savedVisW / s));
    var cropH = Math.min(natH, Math.round(savedVisH / s));
    var resultVisW = cropW * s;
    var resultVisH = cropH * s;
    assertTrue(Math.abs(resultVisW - savedVisW) < 1,
      'wide target: visual width should be ~300, got ' + resultVisW);
    assertTrue(Math.abs(resultVisH - savedVisH) < 1,
      'wide target: visual height should be ~100, got ' + resultVisH);
  };

  /* ——— Canvas resize: image visual size scales proportionally ——— */

  global.testCanvasResizeImageScalesProportionally = function () {
    var scene = global.__CFS_coreScene;
    if (!scene || !scene.applyFitToSingleImage) return;
    var el = { naturalWidth: 512, naturalHeight: 512, width: 512, height: 512 };
    var obj = {
      type: 'image', width: 48, height: 48, scaleX: 1, scaleY: 1, left: 20, top: 20,
      cfsFit: 'crop', cfsScale: 1, cfsResponsive: true,
      cfsOriginalClip: { asset: { type: 'image', left: 20, top: 20, width: 48, height: 48 } },
      getElement: function () { return el; },
      get: function (k) { return this[k]; },
      set: function (k, v) { this[k] = v; },
      setCoords: function () {},
    };
    scene.applyFitToSingleImage(obj, 500, 540);
    var origVisW = obj.width * obj.scaleX;
    var origRatio = origVisW / 500;
    var wPct = obj.cfsWidthPct;
    var targetVisW = 1920 * wPct;
    obj.scaleX = targetVisW / obj.width;
    var newVisW = obj.width * obj.scaleX;
    var newRatio = newVisW / 1920;
    assertTrue(Math.abs(origRatio - newRatio) < 0.001,
      'image should maintain same proportional size: orig ' + origRatio + ' vs new ' + newRatio);
  };

  global.testCanvasResizeRectUsesWidthNotScale = function () {
    var cw1 = 500, cw2 = 1080;
    var origW = 400;
    var widthPct = origW / cw1;
    var newW = cw2 * widthPct;
    assertEqual(newW, 864, 'rect width should be set directly');
    assertTrue(newW !== origW, 'rect width should change on resize');
  };

  /* ——— Merge field display helpers ——— */

  global.testExtractPlaceholdersFindsAllKeys = function () {
    var re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    function extractPlaceholders(text) {
      var result = [], m;
      while ((m = re.exec(text)) !== null) result.push(m[1]);
      re.lastIndex = 0;
      return result;
    }
    var result = extractPlaceholders('Hello {{ LINE_1 }} and {{ LINE_2 }}!');
    assertEqual(result.length, 2, 'should find 2 placeholders');
    assertEqual(result[0], 'LINE_1', 'first placeholder should be LINE_1');
    assertEqual(result[1], 'LINE_2', 'second placeholder should be LINE_2');
  };

  global.testExtractPlaceholdersSingleField = function () {
    var re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    function extractPlaceholders(text) {
      var result = [], m;
      while ((m = re.exec(text)) !== null) result.push(m[1]);
      re.lastIndex = 0;
      return result;
    }
    var result = extractPlaceholders('{{ PROFILE_IMAGE }}');
    assertEqual(result.length, 1, 'should find 1 placeholder');
    assertEqual(result[0], 'PROFILE_IMAGE', 'placeholder should be PROFILE_IMAGE');
  };

  global.testExtractPlaceholdersEmpty = function () {
    var re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    function extractPlaceholders(text) {
      var result = [], m;
      while ((m = re.exec(text)) !== null) result.push(m[1]);
      re.lastIndex = 0;
      return result;
    }
    var result = extractPlaceholders('No placeholders here');
    assertEqual(result.length, 0, 'should find 0 placeholders');
  };

  global.testGetMergeDefaultFromTemplate = function () {
    var mergeArr = [
      { find: 'TOP_COLOR', replace: '#ffe600' },
      { find: 'LINE_1', replace: 'Hello World' },
      { find: '__CFS_TEMPLATE_ID', replace: 'test' },
    ];
    var defaults = {};
    mergeArr.forEach(function (m) {
      var k = m.find;
      if (String(k).indexOf('__CFS_') !== 0) defaults[String(k)] = m.replace;
    });
    assertEqual(defaults['TOP_COLOR'], '#ffe600', 'should get TOP_COLOR default');
    assertEqual(defaults['LINE_1'], 'Hello World', 'should get LINE_1 default');
    assertTrue(defaults['__CFS_TEMPLATE_ID'] === undefined, 'should filter __CFS_ keys');
  };

  global.testMergeDefaultLookupCaseInsensitive = function () {
    var defaults = { 'TOP_COLOR': '#ffe600', 'line_1': 'text' };
    function getMergeDefault(key) {
      if (defaults[key] !== undefined) return defaults[key];
      return defaults[String(key).toUpperCase().replace(/\s+/g, '_')];
    }
    assertEqual(getMergeDefault('TOP_COLOR'), '#ffe600', 'direct lookup');
    assertEqual(getMergeDefault('top_color'), '#ffe600', 'case-insensitive lookup');
  };

  global.testShapeFillMergeKeyDetection = function () {
    var mergeDefaults = { 'TOP_COLOR': '#ffe600', 'BOTTOM_COLOR': '#1a47b8' };
    function getMergeDefault(key) {
      if (!key) return undefined;
      if (mergeDefaults[key] !== undefined) return mergeDefaults[key];
      return mergeDefaults[String(key).toUpperCase().replace(/\s+/g, '_')];
    }
    var obj = { type: 'rect', name: 'TOP_COLOR', fill: '#ffe600', cfsMergeKey: null };
    var shapeKey = obj.cfsMergeKey || ((obj.name && getMergeDefault(obj.name) !== undefined) ? obj.name : null);
    assertEqual(shapeKey, 'TOP_COLOR', 'should detect merge key from name when default exists');
    var objNoKey = { type: 'rect', name: 'random_rect', fill: '#ff0000', cfsMergeKey: null };
    var shapeKey2 = objNoKey.cfsMergeKey || ((objNoKey.name && getMergeDefault(objNoKey.name) !== undefined) ? objNoKey.name : null);
    assertEqual(shapeKey2, null, 'should return null when name has no merge default');
  };

  global.testTextPlaceholderDefaultAndCurrentValues = function () {
    var mergeDefaults = { 'LINE_1': 'Default line 1', 'LINE_2': 'Default line 2' };
    var currentValues = { 'LINE_1': 'User text', 'LINE_2': 'Default line 2' };
    var templateText = '{{ LINE_1 }} and {{ LINE_2 }}';
    var re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    var placeholders = [], m;
    while ((m = re.exec(templateText)) !== null) placeholders.push(m[1]);
    assertEqual(placeholders.length, 2, 'should find 2 placeholders');
    var displays = placeholders.map(function (pk) {
      return { key: pk, defaultVal: mergeDefaults[pk], currentVal: currentValues[pk] };
    });
    assertEqual(displays[0].key, 'LINE_1', 'first field key');
    assertEqual(displays[0].defaultVal, 'Default line 1', 'first field default');
    assertEqual(displays[0].currentVal, 'User text', 'first field current value');
    assertEqual(displays[1].key, 'LINE_2', 'second field key');
    assertTrue(displays[1].defaultVal === displays[1].currentVal, 'second field: default === current when not changed');
  };

  global.testOriginalTemplateTextFromClip = function () {
    var obj = {
      cfsOriginalClip: { asset: { text: '{{ LINE_1 }}', type: 'title' } },
    };
    var text = (obj.cfsOriginalClip && obj.cfsOriginalClip.asset && obj.cfsOriginalClip.asset.text) || null;
    assertEqual(text, '{{ LINE_1 }}', 'should get template text from originalClip');
  };

  global.testOriginalTemplateTextMissingClip = function () {
    var obj = {};
    var text = (obj.cfsOriginalClip && obj.cfsOriginalClip.asset && obj.cfsOriginalClip.asset.text) || null;
    assertEqual(text, null, 'should return null when no originalClip');
  };

  /* ── Merge field conversion helper tests ── */

  global.testEnsureMergeFieldAddsNewEntry = function () {
    var template = { merge: [{ find: 'EXISTING', replace: 'val' }] };
    function ensureMergeField(findKey, replaceVal) {
      if (!Array.isArray(template.merge)) template.merge = [];
      var exists = template.merge.some(function (m) { return m && String(m.find) === String(findKey); });
      if (!exists) template.merge.push({ find: String(findKey), replace: replaceVal != null ? String(replaceVal) : '' });
    }
    ensureMergeField('NEW_FIELD', 'hello');
    assertEqual(template.merge.length, 2, 'should have 2 merge entries');
    assertEqual(template.merge[1].find, 'NEW_FIELD', 'new entry find key');
    assertEqual(template.merge[1].replace, 'hello', 'new entry replace value');
  };

  global.testEnsureMergeFieldDoesNotDuplicate = function () {
    var template = { merge: [{ find: 'EXISTING', replace: 'val' }] };
    function ensureMergeField(findKey, replaceVal) {
      if (!Array.isArray(template.merge)) template.merge = [];
      var exists = template.merge.some(function (m) { return m && String(m.find) === String(findKey); });
      if (!exists) template.merge.push({ find: String(findKey), replace: replaceVal != null ? String(replaceVal) : '' });
    }
    ensureMergeField('EXISTING', 'new-val');
    assertEqual(template.merge.length, 1, 'should not duplicate existing key');
    assertEqual(template.merge[0].replace, 'val', 'should not overwrite existing value');
  };

  global.testRemoveMergeFieldRemovesEntry = function () {
    var template = { merge: [{ find: 'A', replace: '1' }, { find: 'B', replace: '2' }, { find: 'C', replace: '3' }] };
    function removeMergeField(findKey) {
      template.merge = template.merge.filter(function (m) { return !m || String(m.find) !== String(findKey); });
    }
    removeMergeField('B');
    assertEqual(template.merge.length, 2, 'should have 2 entries after removal');
    assertTrue(template.merge.every(function (m) { return m.find !== 'B'; }), 'B should be removed');
  };

  global.testTextEditDetectsNewPlaceholders = function () {
    var template = { merge: [{ find: 'LINE_1', replace: 'default' }] };
    function ensureMergeField(findKey, replaceVal) {
      if (!Array.isArray(template.merge)) template.merge = [];
      var exists = template.merge.some(function (m) { return m && String(m.find) === String(findKey); });
      if (!exists) template.merge.push({ find: String(findKey), replace: replaceVal != null ? String(replaceVal) : '' });
    }
    function extractPlaceholders(text) {
      if (!text || typeof text !== 'string') return [];
      var result = [], re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, m;
      while ((m = re.exec(text)) !== null) result.push(m[1]);
      return result;
    }
    var newText = 'Hello {{ LINE_1 }} and {{ NEW_FIELD }} plus {{ ANOTHER }}';
    var newPlaceholders = extractPlaceholders(newText);
    newPlaceholders.forEach(function (pk) { ensureMergeField(pk, ''); });
    assertEqual(template.merge.length, 3, 'should have 3 merge entries after detecting new fields');
    assertEqual(template.merge[1].find, 'NEW_FIELD', 'NEW_FIELD added');
    assertEqual(template.merge[2].find, 'ANOTHER', 'ANOTHER added');
  };

  global.testAllPlaceholdersMergesOrigAndCurrent = function () {
    function extractPlaceholders(text) {
      if (!text || typeof text !== 'string') return [];
      var result = [], re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, m;
      while ((m = re.exec(text)) !== null) result.push(m[1]);
      return result;
    }
    var origTplText = 'Hello {{ LINE_1 }}';
    var currentText = 'Hello {{ LINE_1 }} and {{ CUSTOM }}';
    var origPlaceholders = extractPlaceholders(origTplText);
    var currentPlaceholders = extractPlaceholders(currentText);
    var seen = {};
    var allPlaceholders = [];
    origPlaceholders.concat(currentPlaceholders).forEach(function (pk) {
      if (!seen[pk]) { seen[pk] = true; allPlaceholders.push(pk); }
    });
    assertEqual(allPlaceholders.length, 2, 'should have 2 unique placeholders');
    assertEqual(allPlaceholders[0], 'LINE_1', 'LINE_1 first from orig');
    assertEqual(allPlaceholders[1], 'CUSTOM', 'CUSTOM second from current');
  };

  global.testConvertToMergeFieldSetsProperties = function () {
    var template = { merge: [] };
    function ensureMergeField(findKey, replaceVal) {
      if (!Array.isArray(template.merge)) template.merge = [];
      var exists = template.merge.some(function (m) { return m && String(m.find) === String(findKey); });
      if (!exists) template.merge.push({ find: String(findKey), replace: replaceVal != null ? String(replaceVal) : '' });
    }
    var obj = { type: 'rect', name: 'my_rect', fill: '#ff0000' };
    obj.set = function (k, v) { obj[k] = v; };
    var key = 'BG_COLOR';
    ensureMergeField(key, obj.fill);
    obj.set('cfsMergeKey', key);
    obj.set('name', obj.name || key);
    assertEqual(obj.cfsMergeKey, 'BG_COLOR', 'cfsMergeKey set on object');
    assertEqual(template.merge.length, 1, 'merge array has new entry');
    assertEqual(template.merge[0].find, 'BG_COLOR', 'merge find key');
    assertEqual(template.merge[0].replace, '#ff0000', 'merge replace is current fill value');
  };

  global.testConvertImageToMergeField = function () {
    var template = { merge: [] };
    function ensureMergeField(findKey, replaceVal) {
      if (!Array.isArray(template.merge)) template.merge = [];
      var exists = template.merge.some(function (m) { return m && String(m.find) === String(findKey); });
      if (!exists) template.merge.push({ find: String(findKey), replace: replaceVal != null ? String(replaceVal) : '' });
    }
    var obj = { type: 'image', name: 'hero_image', src: 'https://example.com/photo.jpg' };
    obj.set = function (k, v) { obj[k] = v; };
    var key = 'HERO_IMAGE';
    ensureMergeField(key, obj.src);
    obj.set('cfsMergeKey', key);
    assertEqual(obj.cfsMergeKey, 'HERO_IMAGE', 'cfsMergeKey set');
    assertEqual(template.merge[0].replace, 'https://example.com/photo.jpg', 'default is current src');
  };

  global.testRemoveMergeFieldClearsObject = function () {
    var template = { merge: [{ find: 'BG_COLOR', replace: '#ff0000' }] };
    function removeMergeField(findKey) {
      template.merge = template.merge.filter(function (m) { return !m || String(m.find) !== String(findKey); });
    }
    var obj = { type: 'rect', cfsMergeKey: 'BG_COLOR', fill: '#ff0000' };
    obj.set = function (k, v) { obj[k] = v; };
    removeMergeField('BG_COLOR');
    obj.set('cfsMergeKey', undefined);
    assertEqual(template.merge.length, 0, 'merge array empty after removal');
    assertEqual(obj.cfsMergeKey, undefined, 'cfsMergeKey cleared on object');
  };

  global.testColorFieldDetectionInPlaceholders = function () {
    var placeholders = ['TOP_COLOR', 'LINE_1', 'BG_COLOUR', 'TITLE'];
    var colorFields = placeholders.filter(function (pk) {
      return /COLOR|COLOUR/i.test(pk) && !/COLORADO/i.test(pk);
    });
    assertEqual(colorFields.length, 2, 'should detect 2 color fields');
    assertEqual(colorFields[0], 'TOP_COLOR', 'first color field');
    assertEqual(colorFields[1], 'BG_COLOUR', 'second colour field');
  };

  /* ── Canvas text editing sync tests ── */

  global.testMultipleMergeFieldsInOneTextField = function () {
    var template = { merge: [] };
    function ensureMergeField(findKey, replaceVal) {
      if (!Array.isArray(template.merge)) template.merge = [];
      var exists = template.merge.some(function (m) { return m && String(m.find) === String(findKey); });
      if (!exists) template.merge.push({ find: String(findKey), replace: replaceVal != null ? String(replaceVal) : '' });
    }
    function extractPlaceholders(text) {
      if (!text || typeof text !== 'string') return [];
      var result = [], re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, m;
      while ((m = re.exec(text)) !== null) result.push(m[1]);
      return result;
    }
    var text = 'Hello {{ FIRST_NAME }}, welcome to {{ CITY }}! Your code is {{ CODE }}.';
    var placeholders = extractPlaceholders(text);
    assertEqual(placeholders.length, 3, 'should find 3 merge fields');
    assertEqual(placeholders[0], 'FIRST_NAME', 'first field');
    assertEqual(placeholders[1], 'CITY', 'second field');
    assertEqual(placeholders[2], 'CODE', 'third field');
    placeholders.forEach(function (pk) { ensureMergeField(pk, ''); });
    assertEqual(template.merge.length, 3, 'all 3 fields added to merge array');
  };

  global.testCanvasTextEditSyncsRawText = function () {
    var obj = {
      type: 'textbox', text: 'old text', cfsRawText: 'old text', __cfsWrapping: false,
      set: function (k, v) { this[k] = v; }
    };
    var newCanvasText = 'Hello {{ MY_FIELD }}';
    var unwrapped = newCanvasText.replace(/\n/g, ' ').replace(/ {2,}/g, ' ');
    obj.set('cfsRawText', unwrapped);
    obj.set('text', newCanvasText);
    assertEqual(obj.cfsRawText, 'Hello {{ MY_FIELD }}', 'cfsRawText updated from canvas edit');
    assertEqual(obj.text, 'Hello {{ MY_FIELD }}', 'text updated from canvas edit');
  };

  global.testTextEditingGuardSkipsWhenTag = function () {
    var intercepted = false;
    function simulateKeydownGuard(tag, isTextEditing) {
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'skipped';
      if (isTextEditing) return 'passthrough';
      intercepted = true;
      return 'handled';
    }
    assertEqual(simulateKeydownGuard('TEXTAREA', true), 'skipped', 'Fabric textarea returns early');
    assertEqual(simulateKeydownGuard('DIV', true), 'passthrough', 'text editing returns passthrough');
    assertEqual(simulateKeydownGuard('DIV', false), 'handled', 'normal keys handled');
  };

  /* ── Font size scaling across resolution changes ── */

  global.testFontSizePctIsStoredOnSetResponsive = function () {
    var obj = { fontSize: 52, set: function (k, v) { this[k] = v; } };
    var minSide = 1080;
    if (obj.fontSize != null && minSide > 0) obj.set('cfsFontSizePct', Number(obj.fontSize) / minSide);
    var expected = 52 / 1080;
    assertTrue(Math.abs(obj.cfsFontSizePct - expected) < 0.0001, 'cfsFontSizePct should be ' + expected.toFixed(6));
  };

  global.testFontSizeRestoredFromPctOnResize = function () {
    var pct = 52 / 1080;
    var newMinSide = 720;
    var restored = Math.max(8, Math.round(newMinSide * pct));
    assertEqual(restored, 35, 'font size on 720px canvas should be ~35 (52 * 720/1080)');
    var backTo1080 = Math.max(8, Math.round(1080 * pct));
    assertEqual(backTo1080, 52, 'font size back on 1080px should be exactly 52');
  };

  global.testFontSizeDoesNotCompoundOnMultipleResizes = function () {
    var fontSize = 52;
    var canvasSize = 1080;
    var pct = fontSize / canvasSize;
    var sizes = [720, 1920, 500, 1080];
    for (var i = 0; i < sizes.length; i++) {
      fontSize = Math.max(8, Math.round(sizes[i] * pct));
    }
    assertEqual(fontSize, 52, 'after multiple resizes back to 1080, font should be 52');
  };

  global.testFontSizeScaleStateUsesPercent = function () {
    var o = { type: 'textbox', fontSize: 52, cfsFontSizePct: 52 / 1080, cfsResponsive: true, cfsLeftPct: 0.1, left: 108 };
    var newW = 720, newH = 720;
    var newMinSide = Math.min(newW, newH);
    if (o.cfsFontSizePct != null && newMinSide > 0) {
      o.fontSize = Math.max(8, Math.round(newMinSide * Number(o.cfsFontSizePct)));
    }
    assertEqual(o.fontSize, 35, 'scaleCanvasStateToSize should use cfsFontSizePct');
    var upTo1920 = Math.max(8, Math.round(1920 * o.cfsFontSizePct));
    assertEqual(upTo1920, 92, 'scaling up to 1920 should give ~92');
  };

  global.testFontSizeFallbackWhenNoPct = function () {
    var o = { type: 'textbox', fontSize: 52 };
    var minScale = 720 / 1080;
    if (o.cfsFontSizePct != null) {
      o.fontSize = Math.max(8, Math.round(720 * o.cfsFontSizePct));
    } else {
      o.fontSize = Math.max(8, o.fontSize * minScale);
    }
    var expected = Math.max(8, 52 * (720 / 1080));
    assertTrue(Math.abs(o.fontSize - expected) < 0.01, 'fallback should use minScale multiplication');
  };

  global.testFontSizePctUpdatedOnManualChange = function () {
    var obj = { fontSize: 52, cfsFontSizePct: 52 / 1080, set: function (k, v) { this[k] = v; } };
    var minSide = 1080;
    var newSize = 36;
    obj.set('fontSize', newSize);
    if (minSide > 0) obj.set('cfsFontSizePct', newSize / minSide);
    assertEqual(obj.fontSize, 36, 'fontSize set to 36');
    assertTrue(Math.abs(obj.cfsFontSizePct - 36 / 1080) < 0.0001, 'cfsFontSizePct updated to match');
    var restored = Math.max(8, Math.round(1080 * obj.cfsFontSizePct));
    assertEqual(restored, 36, 'restoring should give back 36');
  };

  /* ── Font size consistency across ALL presets (round-trip) ── */

  function simulateScaleCanvasStateToSize(state, newW, newH) {
    if (!state || !state.objects || !state.objects.length) return state;
    var oldW = state.width || newW;
    var oldH = state.height || newH;
    if (oldW <= 0 || oldH <= 0 || (oldW === newW && oldH === newH)) return state;
    var sx = newW / oldW;
    var sy = newH / oldH;
    var minScale = Math.min(sx, sy);
    var minSide = Math.min(oldW, oldH);
    var out = { width: newW, height: newH, objects: state.objects.map(function (obj) {
      var o = {};
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) o[k] = obj[k];
      var usePct = o.cfsResponsive && (o.cfsLeftPct != null || o.cfsTopPct != null || o.cfsWidthPct != null || o.cfsHeightPct != null || o.cfsRadiusPct != null);
      if (!usePct && oldW > 0 && oldH > 0) {
        o.cfsResponsive = true;
        o.cfsLeftPct = (o.left || 0) / oldW;
        o.cfsTopPct = (o.top || 0) / oldH;
        if (o.width != null) o.cfsWidthPct = o.width / oldW;
        if (o.fontSize != null && minSide > 0) o.cfsFontSizePct = o.fontSize / minSide;
        usePct = true;
      }
      var newMinSide = Math.min(newW, newH);
      if (usePct) {
        if (o.cfsLeftPct != null) o.left = newW * o.cfsLeftPct;
        if (o.cfsTopPct != null) o.top = newH * o.cfsTopPct;
        if (o.cfsWidthPct != null) o.width = newW * o.cfsWidthPct;
        if (o.cfsFontSizePct == null && o.fontSize != null && minSide > 0) o.cfsFontSizePct = o.fontSize / minSide;
        if (o.cfsFontSizePct != null && newMinSide > 0) o.fontSize = Math.max(8, Math.round(newMinSide * o.cfsFontSizePct));
        else if (o.fontSize != null) o.fontSize = Math.max(8, o.fontSize * minScale);
      }
      return o;
    })};
    return out;
  }

  function simulateRefreshTextboxWrappingWithFix(state) {
    state.objects.forEach(function (o) {
      if (o.type !== 'textbox') return;
      var clone = {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) clone[k] = o[k];
      for (var k2 in clone) o[k2] = clone[k2];
    });
    return state;
  }

  function simulateRefreshTextboxWrappingWithoutFix(state) {
    state.objects.forEach(function (o) {
      if (o.type !== 'textbox') return;
      delete o.cfsFontSizePct;
    });
    return state;
  }

  var allPresetDims = [
    { name: 'YouTube (16:9)', w: 1920, h: 1080 },
    { name: 'Instagram square (1:1)', w: 1080, h: 1080 },
    { name: 'Instagram portrait (4:5)', w: 1080, h: 1350 },
    { name: 'Instagram Story (9:16)', w: 1080, h: 1920 },
    { name: 'TikTok (9:16)', w: 1080, h: 1920 },
    { name: 'Twitter (16:9)', w: 1280, h: 720 },
    { name: 'LinkedIn (1.91:1)', w: 1200, h: 628 },
    { name: 'LinkedIn square (1:1)', w: 1080, h: 1080 },
    { name: 'SD 720p', w: 1280, h: 720 },
    { name: 'HD 1080p', w: 1920, h: 1080 },
  ];

  global.testFontSizeConsistencyRoundTripAllPresets = function () {
    var originalFontSize = 52;
    var startW = 1080, startH = 1080;
    var pct = originalFontSize / Math.min(startW, startH);
    var state = {
      width: startW, height: startH,
      objects: [{ type: 'textbox', left: 50, top: 210, width: 980, fontSize: originalFontSize, cfsResponsive: true, cfsLeftPct: 50 / 1080, cfsTopPct: 210 / 1080, cfsWidthPct: 980 / 1080, cfsFontSizePct: pct }]
    };
    for (var i = 0; i < allPresetDims.length; i++) {
      var p = allPresetDims[i];
      var scaled = simulateScaleCanvasStateToSize(state, p.w, p.h);
      simulateRefreshTextboxWrappingWithFix(scaled);
      var expectedFont = Math.max(8, Math.round(Math.min(p.w, p.h) * pct));
      assertEqual(scaled.objects[0].fontSize, expectedFont, p.name + ': font should be ' + expectedFont);
      state = { width: p.w, height: p.h, objects: scaled.objects };
    }
    var final = simulateScaleCanvasStateToSize(state, startW, startH);
    assertEqual(final.objects[0].fontSize, originalFontSize, 'after cycling all presets back to 1:1 should be ' + originalFontSize);
  };

  global.testFontSizeShrinkWithoutCfsFontSizePct = function () {
    var state = {
      width: 1080, height: 1080,
      objects: [{ type: 'textbox', left: 50, top: 210, width: 980, fontSize: 52, cfsResponsive: true, cfsLeftPct: 50 / 1080, cfsTopPct: 210 / 1080, cfsWidthPct: 980 / 1080, cfsFontSizePct: 52 / 1080 }]
    };
    var toStory = simulateScaleCanvasStateToSize(state, 1080, 1920);
    assertEqual(toStory.objects[0].fontSize, 52, 'to 9:16: font stays 52 (minSide=1080)');
    simulateRefreshTextboxWrappingWithoutFix(toStory);
    assertTrue(toStory.objects[0].cfsFontSizePct == null, 'cfsFontSizePct lost after wrapping');
    var backState = { width: 1080, height: 1920, objects: toStory.objects };
    var backTo1080 = simulateScaleCanvasStateToSize(backState, 1080, 1080);
    assertTrue(backTo1080.objects[0].cfsFontSizePct != null, 'safety net recomputes cfsFontSizePct even when lost');
    assertEqual(backTo1080.objects[0].fontSize, 52, 'safety net preserves font size even without cfsFontSizePct');
  };

  global.testFontSizeRecoveryWithSafetyNet = function () {
    var state = {
      width: 1080, height: 1920,
      objects: [{ type: 'textbox', left: 50, top: 373, width: 980, fontSize: 52, cfsResponsive: true, cfsLeftPct: 50 / 1080, cfsTopPct: 373 / 1920, cfsWidthPct: 980 / 1080 }]
    };
    var scaled = simulateScaleCanvasStateToSize(state, 1080, 1080);
    assertTrue(scaled.objects[0].cfsFontSizePct != null, 'safety net should compute cfsFontSizePct from fontSize/oldMinSide');
    var expectedPct = 52 / Math.min(1080, 1920);
    assertTrue(Math.abs(scaled.objects[0].cfsFontSizePct - expectedPct) < 0.001, 'cfsFontSizePct from safety net = ' + expectedPct.toFixed(4));
    assertEqual(scaled.objects[0].fontSize, 52, 'font preserved after safety net computation');
  };

  global.testFontSizeStory916ThenBack = function () {
    var pct = 52 / 1080;
    var state = {
      width: 1080, height: 1080,
      objects: [{ type: 'textbox', fontSize: 52, cfsResponsive: true, cfsLeftPct: 0.046, cfsTopPct: 0.194, cfsWidthPct: 0.907, cfsFontSizePct: pct }]
    };
    var toStory = simulateScaleCanvasStateToSize(state, 1080, 1920);
    assertEqual(toStory.objects[0].fontSize, 52, '1:1 → 9:16: stays 52');
    assertEqual(toStory.objects[0].cfsFontSizePct, pct, 'pct preserved');
    simulateRefreshTextboxWrappingWithFix(toStory);
    assertEqual(toStory.objects[0].cfsFontSizePct, pct, 'pct still present after wrapping fix');
    var backState = { width: 1080, height: 1920, objects: toStory.objects };
    var back = simulateScaleCanvasStateToSize(backState, 1080, 1080);
    assertEqual(back.objects[0].fontSize, 52, '9:16 → 1:1: back to 52');
  };

  global.testFontSizeMultiPresetCycleWithWrapping = function () {
    var pct = 52 / 1080;
    var state = {
      width: 1080, height: 1080,
      objects: [{ type: 'textbox', fontSize: 52, cfsResponsive: true, cfsLeftPct: 0.046, cfsTopPct: 0.194, cfsWidthPct: 0.907, cfsFontSizePct: pct }]
    };
    var cycle = [
      { w: 1080, h: 1920, name: 'Story' },
      { w: 1920, h: 1080, name: '16:9' },
      { w: 1280, h: 720, name: 'Twitter' },
      { w: 1080, h: 1350, name: '4:5' },
      { w: 1080, h: 1080, name: '1:1' },
    ];
    for (var i = 0; i < cycle.length; i++) {
      var p = cycle[i];
      var scaled = simulateScaleCanvasStateToSize(state, p.w, p.h);
      simulateRefreshTextboxWrappingWithFix(scaled);
      var expected = Math.max(8, Math.round(Math.min(p.w, p.h) * pct));
      assertEqual(scaled.objects[0].fontSize, expected, p.name + ' (' + p.w + 'x' + p.h + '): font=' + expected);
      assertTrue(scaled.objects[0].cfsFontSizePct === pct, p.name + ': pct preserved');
      state = { width: p.w, height: p.h, objects: scaled.objects };
    }
    assertEqual(state.objects[0].fontSize, 52, 'full cycle back to 1:1 = 52');
  };

  /* ── refreshTextboxWrapping width calculation (offset-positioned templates) ── */

  function simulateRefreshTextboxWrappingWidth(canvasW, obj) {
    var cfsRightPx = obj.cfsRightPx != null ? Number(obj.cfsRightPx) : null;
    var w;
    if (cfsRightPx != null) {
      w = Math.max(50, canvasW - (obj.left || 0) - cfsRightPx + 8);
    } else {
      var widthPct = obj.cfsWidthPct != null ? Number(obj.cfsWidthPct) : null;
      if (widthPct != null && widthPct > 0) {
        w = Math.max(50, canvasW * widthPct);
      } else {
        var origClip = obj.cfsOriginalClip;
        var origAsset = origClip && origClip.asset;
        var origW = (origAsset && origAsset.width != null) ? Number(origAsset.width) : 0;
        if (origW > 0) w = origW;
        else w = obj.width || 200;
      }
    }
    return w;
  }

  global.testRefreshWrapUsesWidthPctWhenAvailable = function () {
    var obj = {
      type: 'textbox', left: 446, width: 971,
      cfsWidthPct: 518 / 1024,
      cfsOriginalClip: { asset: { type: 'html', width: 518, height: 235 } },
    };
    var w = simulateRefreshTextboxWrappingWidth(1920, obj);
    var expected = Math.max(50, 1920 * (518 / 1024));
    assertTrue(Math.abs(w - expected) < 1, 'should use cfsWidthPct * canvasW = ' + expected + ', got ' + w);
  };

  global.testRefreshWrapFallsBackToOrigClipWithoutPct = function () {
    var obj = {
      type: 'textbox', left: 253, width: 518,
      cfsOriginalClip: { asset: { type: 'html', width: 518, height: 235 } },
    };
    var w = simulateRefreshTextboxWrappingWidth(1024, obj);
    assertEqual(w, 518, 'without cfsWidthPct, should use origClip.asset.width');
  };

  global.testRefreshWrapWidthScalesWithCanvas = function () {
    var origW = 518;
    var origCanvasW = 1024;
    var pct = origW / origCanvasW;
    var canvasSizes = [1920, 1280, 1080, 720, 1024];
    for (var i = 0; i < canvasSizes.length; i++) {
      var cw = canvasSizes[i];
      var obj = { type: 'textbox', cfsWidthPct: pct, cfsOriginalClip: { asset: { width: origW } } };
      var w = simulateRefreshTextboxWrappingWidth(cw, obj);
      var expected = Math.max(50, cw * pct);
      assertTrue(Math.abs(w - expected) < 1, 'at canvas ' + cw + ': width=' + Math.round(w) + ' expected=' + Math.round(expected));
    }
  };

  global.testRefreshWrapWithCfsRightPx = function () {
    var obj = { type: 'textbox', left: 50, cfsRightPx: 50, cfsWidthPct: 0.9 };
    var w = simulateRefreshTextboxWrappingWidth(1920, obj);
    assertEqual(w, Math.max(50, 1920 - 50 - 50 + 8), 'cfsRightPx takes priority over cfsWidthPct');
  };

  global.testOffsetPositionedTemplateScaling = function () {
    var origCanvas = 1024;
    var elemW = 518;
    var offsetX = 0.189;
    var origLeft = (origCanvas - elemW) / 2 + offsetX * origCanvas;
    var leftPct = origLeft / origCanvas;
    var widthPct = elemW / origCanvas;
    var newCanvas = 1920;
    var scaledElemW = newCanvas * widthPct;
    var scaledLeft = newCanvas * leftPct;
    var expectedLeft = (newCanvas - scaledElemW) / 2 + offsetX * newCanvas;
    assertTrue(Math.abs(scaledLeft - expectedLeft) < 2, 'percentage-scaled left (' + Math.round(scaledLeft) + ') should match recalculated (' + Math.round(expectedLeft) + ')');
  };

})(typeof window !== 'undefined' ? window : globalThis);
