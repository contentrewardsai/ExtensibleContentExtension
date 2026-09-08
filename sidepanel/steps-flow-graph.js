/**
 * Side-panel workflow flowchart (SVG). No third-party graph library —
 * Chrome MV3 has no UI build step, and this stays MIT-compatible.
 *
 * Layout is a top-down flowchart: Start → steps → End, with If branches,
 * Loop bodies, runWorkflow cards, and optional always-on targets.
 */
(function (global) {
  'use strict';

  var NODE_W = 156;
  var NODE_H = 50;
  var DIAMOND_W = 108;
  var DIAMOND_H = 62;
  var TERM_W = 72;
  var TERM_H = 28;
  var JOIN_R = 6;
  var V_GAP = 30;
  var H_GAP = 16;
  var PAD_X = 16;
  var PAD_Y = 14;

  function truncate(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, Math.max(1, n - 1)) + '…';
  }

  function escapeXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function kindOf(action) {
    if (!action || !action.type) return 'step';
    if (action.type === 'ifCondition') return 'if';
    if (action.type === 'loop') return 'loop';
    if (action.type === 'runWorkflow') return 'workflow';
    return 'step';
  }

  function defaultTypeLabel(type) {
    if (type === 'runWorkflow') return 'Workflow';
    if (type === 'ifCondition') return 'If';
    if (type === 'loop') return 'Loop';
    if (type === 'delayBeforeNextRun') return 'Wait (rows)';
    return type || 'Step';
  }

  function nodeCopy(action, index, options) {
    options = options || {};
    var type = (action && action.type) || 'step';
    var typeLabel = (options.typeLabel && options.typeLabel(type)) || defaultTypeLabel(type);
    var summary = '';
    if (options.getLabel) {
      try { summary = String(options.getLabel(action, index) || ''); } catch (_) { summary = ''; }
    }
    if (type === 'runWorkflow') {
      var wfId = action && action.workflowId ? String(action.workflowId) : '';
      var wfName = wfId && options.getWorkflowName ? String(options.getWorkflowName(wfId) || wfId) : wfId;
      return {
        title: 'Workflow',
        subtitle: truncate(wfName || 'Choose workflow', 26),
        tooltip: wfName ? ('Run workflow: ' + wfName) : 'Run another workflow',
        workflowId: wfId,
      };
    }
    if (type === 'ifCondition') {
      var cond = action && action.condition ? String(action.condition) : '';
      return {
        title: 'If',
        subtitle: truncate(cond || 'condition', 18),
        tooltip: cond ? ('If ' + cond) : 'If / else',
      };
    }
    if (type === 'loop') {
      var listVar = action && action.listVariable ? String(action.listVariable).trim() : '';
      var count = action && action.count != null ? String(action.count) : '';
      var loopSub = listVar ? 'each ' + listVar : (count ? count + '×' : 'repeat');
      return {
        title: 'Loop',
        subtitle: truncate(loopSub, 22),
        tooltip: listVar ? ('Loop over ' + listVar) : ('Loop ' + (count || '')),
      };
    }
    if (summary && summary !== type && summary.indexOf(type + ' (') !== 0) {
      return { title: typeLabel, subtitle: truncate(summary, 26), tooltip: summary };
    }
    return { title: typeLabel, subtitle: '', tooltip: typeLabel };
  }

  /**
   * @param {Array} actions
   * @param {object} [options]
   * @returns {{ nodes: Array, edges: Array, width: number, height: number }}
   */
  function layoutWorkflowGraph(actions, options) {
    options = options || {};
    var nodes = [];
    var edges = [];
    var seq = 0;
    function nextId(prefix) {
      seq += 1;
      return (prefix || 'n') + seq;
    }

    function addNode(n) {
      nodes.push(n);
      return n;
    }

    function connect(fromId, toId, label, edgeKind) {
      if (!fromId || !toId) return;
      edges.push({ from: fromId, to: toId, label: label || '', kind: edgeKind || '' });
    }

    function layoutSeq(acts, x, y, incomingId, incomingLabel, pathPrefix, topLevel, parentStepIndex) {
      var cursorY = y;
      var lastId = incomingId;
      var pendingLabel = incomingLabel || '';
      var firstId = null;
      var minX = x;
      var maxX = x + NODE_W;
      var list = Array.isArray(acts) ? acts : [];

      for (var i = 0; i < list.length; i++) {
        var a = list[i] || {};
        var path = pathPrefix === '' ? String(i) : pathPrefix + '.' + i;
        var jumpIndex = topLevel ? i : parentStepIndex;
        var thisIndex = topLevel ? i : undefined;
        var gated = !!(a.runIf && String(a.runIf).trim());
        var copy = nodeCopy(a, topLevel ? i : 0, options);

        if (a.type === 'ifCondition') {
          var ifId = nextId('if');
          var diamondX = x + (NODE_W - DIAMOND_W) / 2;
          addNode({
            id: ifId,
            kind: 'if',
            x: diamondX,
            y: cursorY,
            w: DIAMOND_W,
            h: DIAMOND_H,
            title: copy.title,
            subtitle: copy.subtitle,
            tooltip: copy.tooltip,
            stepIndex: thisIndex,
            parentStepIndex: jumpIndex,
            path: path,
            gated: gated,
            clickable: jumpIndex != null,
          });
          connect(lastId, ifId, pendingLabel);
          pendingLabel = '';
          if (!firstId) firstId = ifId;
          lastId = ifId;
          minX = Math.min(minX, diamondX);
          maxX = Math.max(maxX, diamondX + DIAMOND_W);

          var belowIf = cursorY + DIAMOND_H + V_GAP;
          var thenActs = Array.isArray(a.thenSteps) ? a.thenSteps : [];
          var elseActs = Array.isArray(a.elseSteps) ? a.elseSteps : [];
          var thenX = x - (NODE_W / 2) - (H_GAP / 2);
          var elseX = x + (NODE_W / 2) + (H_GAP / 2);

          if (!thenActs.length && !elseActs.length) {
            cursorY = belowIf;
            continue;
          }

          var thenRes = thenActs.length
            ? layoutSeq(thenActs, thenX, belowIf, ifId, 'yes', path + '.then', false, jumpIndex)
            : { firstId: null, lastId: null, y: belowIf, minX: thenX, maxX: thenX + NODE_W };
          var elseRes = elseActs.length
            ? layoutSeq(elseActs, elseX, belowIf, ifId, 'no', path + '.else', false, jumpIndex)
            : { firstId: null, lastId: null, y: belowIf, minX: elseX, maxX: elseX + NODE_W };

          var mergeY = Math.max(thenRes.y, elseRes.y);
          var joinId = nextId('join');
          addNode({
            id: joinId,
            kind: 'join',
            x: x + (NODE_W / 2) - JOIN_R,
            y: mergeY,
            w: JOIN_R * 2,
            h: JOIN_R * 2,
            title: '',
            subtitle: '',
            tooltip: '',
            path: path + '.join',
            parentStepIndex: jumpIndex,
            clickable: false,
          });
          if (thenRes.lastId) connect(thenRes.lastId, joinId);
          else connect(ifId, joinId, 'yes');
          if (elseRes.lastId) connect(elseRes.lastId, joinId);
          else connect(ifId, joinId, 'no');

          lastId = joinId;
          cursorY = mergeY + (JOIN_R * 2) + V_GAP;
          minX = Math.min(minX, thenRes.minX, elseRes.minX, x);
          maxX = Math.max(maxX, thenRes.maxX, elseRes.maxX, x + NODE_W);
          continue;
        }

        if (a.type === 'loop') {
          var loopId = nextId('loop');
          addNode({
            id: loopId,
            kind: 'loop',
            x: x,
            y: cursorY,
            w: NODE_W,
            h: NODE_H,
            title: copy.title,
            subtitle: copy.subtitle,
            tooltip: copy.tooltip,
            stepIndex: thisIndex,
            parentStepIndex: jumpIndex,
            path: path,
            gated: gated,
            clickable: jumpIndex != null,
          });
          connect(lastId, loopId, pendingLabel);
          pendingLabel = '';
          if (!firstId) firstId = loopId;
          lastId = loopId;
          cursorY += NODE_H + V_GAP;

          var inner = Array.isArray(a.steps) ? a.steps : [];
          if (inner.length) {
            var bodyX = x + 24;
            var body = layoutSeq(inner, bodyX, cursorY, loopId, '', path + '.body', false, jumpIndex);
            if (body.lastId && body.lastId !== loopId) connect(body.lastId, loopId, 'again', 'back');
            lastId = body.lastId || loopId;
            cursorY = body.y;
            minX = Math.min(minX, x, body.minX);
            maxX = Math.max(maxX, x + NODE_W, body.maxX);
          }
          continue;
        }

        var nid = nextId(a.type === 'runWorkflow' ? 'wf' : 's');
        addNode({
          id: nid,
          kind: kindOf(a),
          x: x,
          y: cursorY,
          w: NODE_W,
          h: NODE_H,
          title: copy.title,
          subtitle: copy.subtitle,
          tooltip: copy.tooltip,
          stepIndex: thisIndex,
          parentStepIndex: jumpIndex,
          path: path,
          gated: gated,
          workflowId: copy.workflowId || '',
          clickable: jumpIndex != null,
        });
        connect(lastId, nid, pendingLabel);
        pendingLabel = '';
        if (!firstId) firstId = nid;
        lastId = nid;
        cursorY += NODE_H + V_GAP;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + NODE_W);
      }

      return { firstId: firstId, lastId: lastId, y: cursorY, minX: minX, maxX: maxX };
    }

    var seqX = PAD_X;
    var start = addNode({
      id: 'start',
      kind: 'terminal',
      x: seqX + (NODE_W - TERM_W) / 2,
      y: PAD_Y,
      w: TERM_W,
      h: TERM_H,
      title: 'Start',
      subtitle: '',
      tooltip: 'Start',
      clickable: false,
    });
    var main = layoutSeq(actions || [], seqX, PAD_Y + TERM_H + V_GAP, start.id, '', '', true, undefined);
    var end = addNode({
      id: 'end',
      kind: 'terminal',
      x: seqX + (NODE_W - TERM_W) / 2,
      y: main.y,
      w: TERM_W,
      h: TERM_H,
      title: 'End',
      subtitle: '',
      tooltip: 'End',
      clickable: false,
    });
    connect(main.lastId || start.id, end.id);

    var rules = Array.isArray(options.alwaysOnRules) ? options.alwaysOnRules : [];
    if (rules.length) {
      var aoX = Math.max(main.maxX, seqX + NODE_W) + H_GAP + 8;
      var aoY = PAD_Y;
      var aoHead = addNode({
        id: nextId('ao'),
        kind: 'alwaysOn',
        x: aoX,
        y: aoY,
        w: NODE_W,
        h: NODE_H,
        title: 'Always-on',
        subtitle: 'Out of range',
        tooltip: 'Background monitor: run these workflows when price is out of range',
        clickable: false,
      });
      connect(start.id, aoHead.id, 'monitor', 'dash');
      var prevAo = aoHead.id;
      aoY += NODE_H + V_GAP;
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r] || {};
        var rid = rule.workflowId ? String(rule.workflowId) : '';
        var rname = rid && options.getWorkflowName ? String(options.getWorkflowName(rid) || rid) : (rid || 'Workflow');
        var aoN = addNode({
          id: nextId('aowf'),
          kind: 'workflow',
          x: aoX,
          y: aoY,
          w: NODE_W,
          h: NODE_H,
          title: 'Workflow',
          subtitle: truncate(rname, 26),
          tooltip: (rule.runIf ? String(rule.runIf) + ' → ' : '') + rname,
          workflowId: rid,
          gated: !!(rule.runIf && String(rule.runIf).trim()),
          clickable: false,
        });
        connect(prevAo, aoN.id, '', 'dash');
        prevAo = aoN.id;
        aoY += NODE_H + V_GAP;
      }
      main.maxX = aoX + NODE_W;
      if (aoY > end.y + TERM_H) end.y = aoY;
    }

    var minX = Infinity;
    var minY = Infinity;
    var maxX = 0;
    var maxY = 0;
    for (var n = 0; n < nodes.length; n++) {
      var nd = nodes[n];
      minX = Math.min(minX, nd.x);
      minY = Math.min(minY, nd.y);
      maxX = Math.max(maxX, nd.x + nd.w);
      maxY = Math.max(maxY, nd.y + nd.h);
    }
    var dx = minX < PAD_X ? (PAD_X - minX) : 0;
    var dy = minY < PAD_Y ? (PAD_Y - minY) : 0;
    if (dx || dy) {
      for (var s = 0; s < nodes.length; s++) {
        nodes[s].x += dx;
        nodes[s].y += dy;
      }
      maxX += dx;
      maxY += dy;
    }

    return {
      nodes: nodes,
      edges: edges,
      width: Math.ceil(maxX + PAD_X),
      height: Math.ceil(maxY + PAD_Y),
    };
  }

  function nodeById(layout, id) {
    for (var i = 0; i < layout.nodes.length; i++) {
      if (layout.nodes[i].id === id) return layout.nodes[i];
    }
    return null;
  }

  function edgePath(from, to, kind) {
    var x1 = from.x + from.w / 2;
    var y1 = from.y + from.h;
    var x2 = to.x + to.w / 2;
    var y2 = to.y;
    if (kind === 'back') {
      var left = Math.min(from.x, to.x) - 20;
      var mid = to.y + to.h / 2;
      return 'M ' + x1 + ' ' + y1 + ' C ' + left + ' ' + y1 + ', ' + left + ' ' + mid + ', ' + to.x + ' ' + mid;
    }
    if (from.kind === 'if' && (y2 > y1) && Math.abs(x1 - x2) > 4) {
      var drop = y1 + Math.max(10, (y2 - y1) / 3);
      return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + drop + ' L ' + x2 + ' ' + drop + ' L ' + x2 + ' ' + y2;
    }
    if (Math.abs(x1 - x2) < 3) {
      return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var midY = y1 + (y2 - y1) / 2;
    return 'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + midY + ' L ' + x2 + ' ' + midY + ' L ' + x2 + ' ' + y2;
  }

  function diamondPoints(x, y, w, h) {
    var mx = x + w / 2;
    var my = y + h / 2;
    return mx + ',' + y + ' ' + (x + w) + ',' + my + ' ' + mx + ',' + (y + h) + ' ' + x + ',' + my;
  }

  function renderSvg(layout) {
    var parts = [];
    parts.push('<svg class="steps-flow-svg" role="img" aria-label="Workflow flowchart" width="' + layout.width + '" height="' + layout.height + '" viewBox="0 0 ' + layout.width + ' ' + layout.height + '">');
    parts.push('<defs><marker id="cfsFlowArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path></marker></defs>');

    for (var e = 0; e < layout.edges.length; e++) {
      var edge = layout.edges[e];
      var a = nodeById(layout, edge.from);
      var b = nodeById(layout, edge.to);
      if (!a || !b) continue;
      var cls = 'fg-edge' + (edge.kind === 'dash' || edge.kind === 'back' ? ' fg-edge-dash' : '');
      var d = edgePath(a, b, edge.kind);
      parts.push('<path class="' + cls + '" d="' + d + '" marker-end="url(#cfsFlowArrow)" fill="none"></path>');
      if (edge.label) {
        var lx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
        var ly = (a.y + a.h + b.y) / 2 - 4;
        if (edge.kind === 'back') lx = Math.min(a.x, b.x) - 8;
        parts.push('<text class="fg-edge-label" x="' + lx + '" y="' + ly + '" text-anchor="middle">' + escapeXml(edge.label) + '</text>');
      }
    }

    for (var i = 0; i < layout.nodes.length; i++) {
      var n = layout.nodes[i];
      var extra = n.kind === 'workflow' ? ' fg-node-workflow' : '';
      extra += n.kind === 'if' ? ' fg-node-if' : '';
      extra += n.kind === 'loop' ? ' fg-node-loop' : '';
      extra += n.kind === 'alwaysOn' ? ' fg-node-ao' : '';
      extra += n.gated ? ' fg-node-gated' : '';
      extra += n.clickable ? ' fg-node-clickable' : '';
      var data = ' data-flow-id="' + escapeXml(n.id) + '"';
      if (n.stepIndex != null) data += ' data-flow-step="' + n.stepIndex + '"';
      if (n.parentStepIndex != null) data += ' data-flow-parent="' + n.parentStepIndex + '"';
      if (n.workflowId) data += ' data-flow-workflow="' + escapeXml(n.workflowId) + '"';
      data += ' data-flow-clickable="' + (n.clickable ? '1' : '0') + '"';

      parts.push('<g class="fg-node fg-node-' + escapeXml(n.kind) + extra + '"' + data + '>');
      if (n.tooltip) parts.push('<title>' + escapeXml(n.tooltip) + (n.gated ? ' (runs only if condition is true)' : '') + '</title>');

      if (n.kind === 'if') {
        parts.push('<polygon class="fg-shape" points="' + diamondPoints(n.x, n.y, n.w, n.h) + '"></polygon>');
        parts.push('<text class="fg-title" x="' + (n.x + n.w / 2) + '" y="' + (n.y + n.h / 2 - (n.subtitle ? 4 : 0)) + '" text-anchor="middle">' + escapeXml(n.title || 'If') + '</text>');
        if (n.subtitle) {
          parts.push('<text class="fg-sub" x="' + (n.x + n.w / 2) + '" y="' + (n.y + n.h / 2 + 12) + '" text-anchor="middle">' + escapeXml(n.subtitle) + '</text>');
        }
      } else if (n.kind === 'join') {
        parts.push('<circle class="fg-shape fg-join" cx="' + (n.x + n.w / 2) + '" cy="' + (n.y + n.h / 2) + '" r="' + (n.w / 2) + '"></circle>');
      } else if (n.kind === 'terminal') {
        var ry = n.h / 2;
        parts.push('<rect class="fg-shape" x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="' + ry + '" ry="' + ry + '"></rect>');
        parts.push('<text class="fg-title" x="' + (n.x + n.w / 2) + '" y="' + (n.y + n.h / 2 + 4) + '" text-anchor="middle">' + escapeXml(n.title) + '</text>');
      } else {
        parts.push('<rect class="fg-shape" x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="8" ry="8"></rect>');
        if (n.kind === 'workflow') {
          parts.push('<rect class="fg-wf-bar" x="' + n.x + '" y="' + n.y + '" width="5" height="' + n.h + '" rx="2"></rect>');
        }
        var tx = n.x + 12;
        var titleY = n.subtitle ? n.y + 20 : n.y + n.h / 2 + 4;
        parts.push('<text class="fg-title" x="' + tx + '" y="' + titleY + '">' + escapeXml(n.title) + '</text>');
        if (n.subtitle) {
          parts.push('<text class="fg-sub" x="' + tx + '" y="' + (n.y + 36) + '">' + escapeXml(n.subtitle) + '</text>');
        }
        if (n.gated) {
          parts.push('<text class="fg-gated-mark" x="' + (n.x + n.w - 10) + '" y="' + (n.y + 16) + '" text-anchor="end">if</text>');
        }
      }
      parts.push('</g>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  function renderInto(canvasEl, actions, options) {
    if (!canvasEl) return null;
    var layout = layoutWorkflowGraph(actions, options || {});
    canvasEl.innerHTML = renderSvg(layout);
    if (options && typeof options.onNodeClick === 'function') {
      canvasEl.querySelectorAll('[data-flow-clickable="1"]').forEach(function (g) {
        g.addEventListener('click', function () {
          var stepRaw = g.getAttribute('data-flow-step');
          var parentRaw = g.getAttribute('data-flow-parent');
          options.onNodeClick({
            id: g.getAttribute('data-flow-id'),
            stepIndex: stepRaw != null && stepRaw !== '' ? parseInt(stepRaw, 10) : null,
            parentStepIndex: parentRaw != null && parentRaw !== '' ? parseInt(parentRaw, 10) : null,
            workflowId: g.getAttribute('data-flow-workflow') || '',
          });
        });
      });
    }
    return layout;
  }

  global.CFS_stepsFlowGraph = {
    layoutWorkflowGraph: layoutWorkflowGraph,
    renderSvg: renderSvg,
    renderInto: renderInto,
  };
})(typeof window !== 'undefined' ? window : globalThis);
