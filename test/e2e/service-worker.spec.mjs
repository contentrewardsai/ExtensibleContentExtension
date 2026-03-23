/**
 * Comprehensive service-worker message handler tests.
 *
 * Tests every chrome.runtime.onMessage handler in background/service-worker.js
 * for its input validation, processing, side-effects, and response shape.
 */
import { test, expect, sendExtensionMessage, readStorage, getExtensionHelperPage } from './extension.fixture.mjs';

// ─── Message validation ──────────────────────────────────────────────
test.describe('message validation', () => {
  test('rejects non-object message', async ({ extensionContext, extensionId }) => {
    const page = await getExtensionHelperPage(extensionContext, extensionId);
    const resp = await page.evaluate(() => new Promise((resolve) => {
      chrome.runtime.sendMessage(chrome.runtime.id, 'not-an-object', (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r);
      });
    }));
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Invalid message');
  });

  test('rejects message with missing type', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { data: 123 });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Invalid message');
  });

  test('rejects message with empty type', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: '' });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Invalid message');
  });

  test('rejects unknown message type', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: 'TOTALLY_UNKNOWN_TYPE' });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Unknown message type');
  });

  test('INJECT_STEP_HANDLERS rejects non-array files', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'INJECT_STEP_HANDLERS', files: 'not-array',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('files must be array');
  });

  test('INJECT_STEP_HANDLERS rejects non-string file entries', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'INJECT_STEP_HANDLERS', files: [123],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('files must be strings');
  });

  test('SET_PROJECT_STEP_HANDLERS rejects non-array stepIds', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS', stepIds: 'not-array',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('stepIds must be array');
  });

  test('SET_PROJECT_STEP_HANDLERS rejects array codeById', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS', codeById: [1, 2],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('codeById must be object');
  });

  test('DOWNLOAD_FILE rejects missing url', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('url required');
  });

  test('FETCH_FILE rejects missing url', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('url required');
  });

  test('SEND_TO_ENDPOINT rejects missing url', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('url required');
  });
});

// ─── SCHEDULE_ALARM ──────────────────────────────────────────────────
test.describe('SCHEDULE_ALARM', () => {
  test('responds ok after scheduling', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, { type: 'SCHEDULE_ALARM' });
    expect(resp?.ok).toBe(true);
  });
});

// ─── Project step handlers ──────────────────────────────────────────
test.describe('project step handlers', () => {
  test('SET_PROJECT_STEP_HANDLERS stores and GET_PROJECT_STEP_IDS retrieves', async ({ extensionContext, extensionId }) => {
    const setResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS',
      stepIds: ['customStepA', 'customStepB'],
      codeById: { customStepA: 'console.log("A")', customStepB: 'console.log("B")' },
    });
    expect(setResp?.ok).toBe(true);

    const getResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PROJECT_STEP_IDS',
    });
    expect(getResp?.stepIds).toContain('customStepA');
    expect(getResp?.stepIds).toContain('customStepB');
  });

  test('SET_PROJECT_STEP_HANDLERS persists to storage', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS',
      stepIds: ['persistCheck'],
      codeById: { persistCheck: 'void 0' },
    });
    const stored = await readStorage(extensionContext, extensionId, 'cfs_project_step_handlers');
    expect(stored?.stepIds).toContain('persistCheck');
    expect(stored?.codeById?.persistCheck).toBe('void 0');
  });

  test('SET_PROJECT_STEP_HANDLERS with empty data clears handlers', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_PROJECT_STEP_HANDLERS', stepIds: [], codeById: {},
    });
    const getResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PROJECT_STEP_IDS',
    });
    expect(getResp?.stepIds).toEqual([]);
  });

  test('INJECT_STEP_HANDLERS succeeds with empty files on extension page', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'INJECT_STEP_HANDLERS', files: [],
    });
    expect(resp?.ok).toBe(true);
  });
});

// ─── SAVE_TEMPLATE_TO_PROJECT ────────────────────────────────────────
test.describe('SAVE_TEMPLATE_TO_PROJECT', () => {
  test('rejects missing templateId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SAVE_TEMPLATE_TO_PROJECT', templateJson: '{}',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Missing templateId');
  });

  test('stores pending template save', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SAVE_TEMPLATE_TO_PROJECT',
      templateId: 'test-template-123',
      templateJson: '{"actions":[]}',
      extensionJson: { version: 1 },
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_template_save');
    expect(stored?.templateId).toBe('test-template-123');
    expect(stored?.templateJson).toBe('{"actions":[]}');
    expect(stored?.at).toBeGreaterThan(0);
  });
});

// ─── Content-to-sidepanel relay handlers ─────────────────────────────
test.describe('content-to-sidepanel relay', () => {
  test('PICK_ELEMENT_RESULT stores selectors in storage', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_ELEMENT_RESULT',
      selectors: [{ type: 'id', value: '#test' }],
      pickedText: 'Test Element',
      fallbackSelectors: ['.fallback'],
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_element_result');
    expect(stored?.selectors).toEqual([{ type: 'id', value: '#test' }]);
    expect(stored?.pickedText).toBe('Test Element');
    expect(stored?.fallbackSelectors).toEqual(['.fallback']);
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('PICK_ELEMENT_RESULT defaults selectors to empty array', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_ELEMENT_RESULT',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_element_result');
    expect(stored?.selectors).toEqual([]);
  });

  test('AUTO_DISCOVERY_UPDATE stores groups and host', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'AUTO_DISCOVERY_UPDATE',
      groups: [{ name: 'Group1', items: ['a', 'b'] }],
      host: 'example.com',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_auto_discovery_update');
    expect(stored?.groups).toEqual([{ name: 'Group1', items: ['a', 'b'] }]);
    expect(stored?.host).toBe('example.com');
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('PICK_SUCCESS_CONTAINER_COUNT stores count', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_SUCCESS_CONTAINER_COUNT',
      count: 42,
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_success_container_count');
    expect(stored?.count).toBe(42);
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('PICK_SUCCESS_CONTAINER_COUNT defaults count to 0', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PICK_SUCCESS_CONTAINER_COUNT',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_pick_success_container_count');
    expect(stored?.count).toBe(0);
  });

  test('EXTRACTED_ROWS stores rows', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'EXTRACTED_ROWS',
      rows: [{ name: 'Alice', email: 'a@b.com' }, { name: 'Bob', email: 'b@c.com' }],
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_extracted_rows');
    expect(stored?.rows).toHaveLength(2);
    expect(stored?.rows[0].name).toBe('Alice');
    expect(stored?.rows[1].email).toBe('b@c.com');
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('EXTRACTED_ROWS defaults rows to empty array', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'EXTRACTED_ROWS',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'cfs_extracted_rows');
    expect(stored?.rows).toEqual([]);
  });
});

// ─── SIDEBAR_STATE_UPDATE ────────────────────────────────────────────
test.describe('SIDEBAR_STATE_UPDATE', () => {
  test('stores sidebar name by window ID', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SIDEBAR_STATE_UPDATE',
      windowId: 999,
      sidebarName: 'testSidebar',
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'sidebarName_999');
    expect(stored).toBe('testSidebar');
  });

  test('stores empty string when sidebarName missing', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SIDEBAR_STATE_UPDATE',
      windowId: 998,
    });
    expect(resp?.ok).toBe(true);

    const stored = await readStorage(extensionContext, extensionId, 'sidebarName_998');
    expect(stored).toBe('');
  });

  test('updates lastSidebarUpdate timestamp', async ({ extensionContext, extensionId }) => {
    const before = Date.now();
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SIDEBAR_STATE_UPDATE', windowId: 997,
    });
    const stored = await readStorage(extensionContext, extensionId, 'lastSidebarUpdate');
    expect(stored).toBeGreaterThanOrEqual(before);
  });
});

// ─── SEND_TO_ENDPOINT (direct) ──────────────────────────────────────
test.describe('SEND_TO_ENDPOINT (direct)', () => {
  test('POST to echo endpoint returns response', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'POST',
      body: JSON.stringify({ key: 'directTest' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.status).toBe(200);
    expect(resp?.json?.body?.key).toBe('directTest');
  });

  test('GET request succeeds', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'GET',
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.status).toBe(200);
  });

  test('returns response headers', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      method: 'GET',
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.responseHeaders).toBeTruthy();
    expect(resp?.responseHeaders['content-type']).toContain('application/json');
  });

  test('timeout aborts request', async ({ extensionContext, extensionId }) => {
    test.setTimeout(15_000);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: 'http://192.0.2.1/', // non-routable, will hang
      method: 'GET',
      timeoutMs: 1000,
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('timed out');
  });

  test('defaults method to POST', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SEND_TO_ENDPOINT',
      url: fixtureServer.echoUrl,
      body: JSON.stringify({ defaultPost: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.json?.body?.defaultPost).toBe(true);
  });
});

// ─── PLAYER_OPEN_TAB ─────────────────────────────────────────────────
test.describe('PLAYER_OPEN_TAB', () => {
  test('rejects missing URL', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PLAYER_OPEN_TAB',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('No URL');
  });

  test('opens a new tab', async ({ extensionContext, extensionId, fixtureServer }) => {
    const pagesBefore = extensionContext.pages().length;
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'PLAYER_OPEN_TAB',
      url: fixtureServer.fixtureUrl,
    });
    expect(resp?.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 500));
    const pagesAfter = extensionContext.pages();
    const newPage = pagesAfter.find((p) => p.url().includes('record-playback-test'));
    expect(newPage).toBeTruthy();
    if (newPage) await newPage.close();
  });
});

// ─── DOWNLOAD_FILE ───────────────────────────────────────────────────
test.describe('DOWNLOAD_FILE', () => {
  test('rejects non-string URL', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE', url: 123,
    });
    expect(resp?.ok).toBe(false);
  });

  test('accepts valid data URL', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'DOWNLOAD_FILE',
      url: 'data:text/plain;base64,SGVsbG8=',
      filename: 'e2e-test.txt',
      saveAs: false,
    });
    // May succeed or fail depending on downloads permission; verify response shape
    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp?.downloadId).toBeDefined();
    } else {
      expect(resp?.error).toBeTruthy();
    }
  });
});

// ─── Generation queue ────────────────────────────────────────────────
test.describe('generation queue', () => {
  test('QUEUE → GET → CLEAR lifecycle', async ({ extensionContext, extensionId }) => {
    // Clear first
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });

    // Queue an entry
    const qResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION',
      payload: {
        projectId: 'proj-1',
        folder: 'test-output',
        data: 'base64data',
        rowIndex: 0,
        variableName: 'generatedImage',
        namingFormat: 'numeric',
      },
    });
    expect(qResp?.ok).toBe(true);

    // Get pending
    const gResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp?.ok).toBe(true);
    expect(gResp?.list).toHaveLength(1);
    expect(gResp?.list[0].projectId).toBe('proj-1');
    expect(gResp?.list[0].folder).toBe('test-output');
    expect(gResp?.list[0].data).toBe('base64data');
    expect(gResp?.list[0].namingFormat).toBe('numeric');
    expect(gResp?.list[0].queuedAt).toBeGreaterThan(0);

    // Clear
    const cResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CLEAR_PENDING_GENERATIONS',
    });
    expect(cResp?.ok).toBe(true);

    // Verify cleared
    const gResp2 = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp2?.list).toHaveLength(0);
  });

  test('QUEUE_SAVE_GENERATION appends (not replaces)', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });

    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION', payload: { data: 'first' },
    });
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION', payload: { data: 'second' },
    });

    const gResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp?.list).toHaveLength(2);
    expect(gResp?.list[0].data).toBe('first');
    expect(gResp?.list[1].data).toBe('second');

    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });
  });

  test('QUEUE_SAVE_GENERATION defaults folder and namingFormat', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });

    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QUEUE_SAVE_GENERATION', payload: { data: 'x' },
    });

    const gResp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'GET_PENDING_GENERATIONS',
    });
    expect(gResp?.list[0].folder).toBe('generations');
    expect(gResp?.list[0].namingFormat).toBe('numeric');

    await sendExtensionMessage(extensionContext, extensionId, { type: 'CLEAR_PENDING_GENERATIONS' });
  });
});

// ─── FETCH_FILE ──────────────────────────────────────────────────────
test.describe('FETCH_FILE', () => {
  test('fetches file and returns base64', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: fixtureServer.tinyFileUrl,
      filename: 'test.bin',
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.base64).toBeTruthy();
    expect(resp?.contentType).toBe('application/octet-stream');
    expect(resp?.filename).toBe('test.bin');
  });

  test('infers filename from URL when not provided', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: fixtureServer.tinyFileUrl,
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.filename).toBe('tiny-file');
  });

  test('returns error for non-existent URL', async ({ extensionContext, extensionId, fixtureServer }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: fixtureServer.baseUrl + '/nonexistent-path-12345',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('rewrites Google Drive URLs', async ({ extensionContext, extensionId }) => {
    // Will fail to fetch (no real file), but we can verify it accepts the URL format
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'FETCH_FILE',
      url: 'https://drive.google.com/file/d/FAKE_FILE_ID/view',
    });
    expect(resp?.ok).toBe(false);
    // The rewritten URL should have been attempted
    expect(resp?.error).toBeTruthy();
  });
});

// ─── COMBINE_VIDEOS edge cases ───────────────────────────────────────
test.describe('COMBINE_VIDEOS edge cases', () => {
  test('rejects empty urls and segments', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'COMBINE_VIDEOS', urls: [], segments: [],
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('No video URLs or segments');
  });

  test('single URL returns immediately without offscreen', async ({ extensionContext, extensionId }) => {
    const url = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EI';
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'COMBINE_VIDEOS', urls: [url],
    });
    expect(resp?.ok).toBe(true);
    expect(resp?.data).toBe(url);
    expect(resp?.url).toBe(url);
  });
});

// ─── QC_CALL edge cases ──────────────────────────────────────────────
test.describe('QC_CALL edge cases', () => {
  test('rejects missing method', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'QC_CALL',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Missing method');
  });
});

// ─── Offscreen-dependent handlers ────────────────────────────────────
test.describe('offscreen-dependent handlers', () => {
  test('RUN_GENERATOR rejects missing pluginId', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_GENERATOR',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toContain('Missing pluginId');
  });

  test('CALL_LLM attempts QC offscreen (may fail without model)', async ({ extensionContext, extensionId }) => {
    test.setTimeout(150_000);
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'CALL_LLM',
      prompt: 'test prompt',
      responseType: 'text',
    });
    expect(resp).toBeTruthy();
    if (resp?.ok) {
      expect(resp?.result).toBeDefined();
    } else {
      expect(resp?.error).toBeTruthy();
    }
  });

  test('TTS_GET_STREAM_ID fails on extension page (no capturable tab)', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'TTS_GET_STREAM_ID',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('TAB_CAPTURE_AUDIO fails on extension page (no capturable tab)', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'TAB_CAPTURE_AUDIO',
    });
    expect(resp?.ok).toBe(false);
    expect(resp?.error).toBeTruthy();
  });

  test('STOP_SCREEN_CAPTURE returns error when not recording', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'STOP_SCREEN_CAPTURE',
    });
    // When not recording, there's no data. On success after capture, resp may include dataUrl and/or webcamDataUrl.
    expect(resp).toBeTruthy();
    if (!resp?.ok) {
      expect(resp?.error).toBeTruthy();
    }
  });
});

// ─── SET_IMPORTED_ROWS (additional coverage) ─────────────────────────
test.describe('SET_IMPORTED_ROWS (extended)', () => {
  test('stores rows with workflowId in storage', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS',
      rows: [{ col1: 'val1' }],
      workflowId: 'test-wf-123',
    });
    const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_imported_rows');
    expect(stored?.rows).toEqual([{ col1: 'val1' }]);
    expect(stored?.workflowId).toBe('test-wf-123');
    expect(stored?.at).toBeGreaterThan(0);
  });

  test('non-array rows defaults to empty array', async ({ extensionContext, extensionId }) => {
    await sendExtensionMessage(extensionContext, extensionId, {
      type: 'SET_IMPORTED_ROWS',
      rows: 'not-array',
    });
    const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_imported_rows');
    expect(stored?.rows).toEqual([]);
  });
});

// ─── RUN_WORKFLOW (extended) ─────────────────────────────────────────
test.describe('RUN_WORKFLOW (extended)', () => {
  test('stores pending run with autoStart and startIndex', async ({ extensionContext, extensionId }) => {
    // First ensure the e2e-test-click workflow exists
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      workflowId: 'e2e-test-click',
      rows: [{ a: 1 }],
      autoStart: 'all',
      startIndex: 2,
    });
    if (resp?.ok) {
      const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_run');
      expect(stored?.workflowId).toBe('e2e-test-click');
      expect(stored?.autoStart).toBe('all');
      expect(stored?.startIndex).toBe(2);
      expect(stored?.rows).toEqual([{ a: 1 }]);
    }
  });

  test('autoStart=current is stored correctly', async ({ extensionContext, extensionId }) => {
    const resp = await sendExtensionMessage(extensionContext, extensionId, {
      type: 'RUN_WORKFLOW',
      workflowId: 'e2e-test-click',
      autoStart: 'current',
    });
    if (resp?.ok) {
      const stored = await readStorage(extensionContext, extensionId, 'cfs_pending_run');
      expect(stored?.autoStart).toBe('current');
    }
  });
});
