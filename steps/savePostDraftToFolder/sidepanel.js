(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('savePostDraftToFolder', {
    label: 'Save post draft to folder (pending)',
    defaultAction: {
      type: 'savePostDraftToFolder',
      runIf: '',
      userVariableKey: 'user',
      platformVariableKey: 'platform',
      platformDefault: 'tiktok',
      titleVariableKey: 'title',
      titleDefault: 'Draft',
      descriptionVariableKey: 'description',
      videoVariableKey: 'videoUrl',
      photoUrlsVariableKey: 'photoUrls',
      projectIdVariableKey: 'projectId',
      defaultProjectId: '',
      postFolderIdVariableKey: '',
      optionsVariableKey: '',
      savePathToVariable: '',
    },
    getSummary: function(action) {
      return 'Draft post → uploads/…/posts/pending/';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      function val(k, d) {
        var v = action[k];
        return v != null && v !== '' ? String(v) : d;
      }
      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(val('runIf', '')) + '"></div>' +
        '<div class="step-field"><label>User variable</label><input type="text" data-field="userVariableKey" data-step="' + i + '" value="' + escapeHtml(val('userVariableKey', 'user')) + '"></div>' +
        '<div class="step-field"><label>Platform variable</label><input type="text" data-field="platformVariableKey" data-step="' + i + '" value="' + escapeHtml(val('platformVariableKey', 'platform')) + '"></div>' +
        '<div class="step-field"><label>Default platform(s)</label><input type="text" data-field="platformDefault" data-step="' + i + '" value="' + escapeHtml(val('platformDefault', 'tiktok')) + '"></div>' +
        '<div class="step-field"><label>Title variable</label><input type="text" data-field="titleVariableKey" data-step="' + i + '" value="' + escapeHtml(val('titleVariableKey', 'title')) + '"></div>' +
        '<div class="step-field"><label>Default title</label><input type="text" data-field="titleDefault" data-step="' + i + '" value="' + escapeHtml(val('titleDefault', 'Draft')) + '"></div>' +
        '<div class="step-field"><label>Description variable</label><input type="text" data-field="descriptionVariableKey" data-step="' + i + '" value="' + escapeHtml(val('descriptionVariableKey', 'description')) + '"></div>' +
        '<div class="step-field"><label>Video URL variable</label><input type="text" data-field="videoVariableKey" data-step="' + i + '" value="' + escapeHtml(val('videoVariableKey', 'videoUrl')) + '"></div>' +
        '<div class="step-field"><label>Photo URL(s) variable</label><input type="text" data-field="photoUrlsVariableKey" data-step="' + i + '" value="' + escapeHtml(val('photoUrlsVariableKey', 'photoUrls')) + '"></div>' +
        '<div class="step-field"><label>Project ID row key</label><input type="text" data-field="projectIdVariableKey" data-step="' + i + '" value="' + escapeHtml(val('projectIdVariableKey', 'projectId')) + '"></div>' +
        '<div class="step-field"><label>Default project ID (optional)</label><input type="text" data-field="defaultProjectId" data-step="' + i + '" value="' + escapeHtml(val('defaultProjectId', '')) + '"></div>' +
        '<div class="step-field"><label>Post folder id variable (optional)</label><input type="text" data-field="postFolderIdVariableKey" data-step="' + i + '" value="' + escapeHtml(val('postFolderIdVariableKey', '')) + '"></div>' +
        '<div class="step-field"><label>Options JSON variable (optional)</label><input type="text" data-field="optionsVariableKey" data-step="' + i + '" value="' + escapeHtml(val('optionsVariableKey', '')) + '" placeholder="postOptions"></div>' +
        '<div class="step-field"><label>Save path to variable (optional)</label><input type="text" data-field="savePathToVariable" data-step="' + i + '" value="' + escapeHtml(val('savePathToVariable', '')) + '"></div>' +
        '<span class="step-hint">Writes <code>uploads/&lt;projectId&gt;/posts/pending/&lt;post_id&gt;/post.json</code>. Side panel must be open.</span>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('savePostDraftToFolder', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      function get(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      }
      var out = { type: 'savePostDraftToFolder' };
      var r = (get('runIf') || '').trim();
      if (r) out.runIf = r;
      out.userVariableKey = (get('userVariableKey') || '').trim() || 'user';
      out.platformVariableKey = (get('platformVariableKey') || '').trim() || 'platform';
      out.platformDefault = (get('platformDefault') || '').trim() || 'tiktok';
      out.titleVariableKey = (get('titleVariableKey') || '').trim() || 'title';
      out.titleDefault = (get('titleDefault') || '').trim() || 'Draft';
      out.descriptionVariableKey = (get('descriptionVariableKey') || '').trim() || 'description';
      out.videoVariableKey = (get('videoVariableKey') || '').trim() || 'videoUrl';
      out.photoUrlsVariableKey = (get('photoUrlsVariableKey') || '').trim() || 'photoUrls';
      out.projectIdVariableKey = (get('projectIdVariableKey') || '').trim() || 'projectId';
      var dp = (get('defaultProjectId') || '').trim();
      if (dp) out.defaultProjectId = dp;
      var pf = (get('postFolderIdVariableKey') || '').trim();
      if (pf) out.postFolderIdVariableKey = pf;
      var ov = (get('optionsVariableKey') || '').trim();
      if (ov) out.optionsVariableKey = ov;
      var sp = (get('savePathToVariable') || '').trim();
      if (sp) out.savePathToVariable = sp;
      return out;
    },
  });
})();
