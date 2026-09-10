/**
 * Attach to an already-open Chrome side panel over CDP and click through
 * Plan → type task → Run on this tab.
 */
const PORT = Number(process.env.CFS_CDP_PORT || 9334);
const log = (...a) => console.error('[cdp-ui]', ...a);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result || {});
    }
  });
  async function send(method, params) {
    const id = nextId++;
    const result = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('timeout ' + method));
        }
      }, 30000);
    });
    return result;
  }
  return { ws, send };
}

async function main() {
  const listed = await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json());
  log('targets', listed.map((t) => t.type + ' ' + (t.url || '')).join(' | '));
  const side = listed.find((t) => /sidepanel\/sidepanel\.html/.test(t.url || ''));
  const google = listed.find((t) => /https:\/\/www\.google\./.test(t.url || ''));
  if (!side || !side.webSocketDebuggerUrl) throw new Error('no side panel target');
  if (!google) throw new Error('no google target');

  const session = await cdpSession(side.webSocketDebuggerUrl);
  await session.send('Runtime.enable');

  async function evalExpr(expression, awaitPromise) {
    const r = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: !!awaitPromise,
    });
    if (r.exceptionDetails) {
      throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || 'eval failed');
    }
    return r.result && r.result.value;
  }

  const ready = await evalExpr(`({
    href: location.href,
    input: !!document.getElementById('llmChatInput'),
    run: !!document.getElementById('llmChatRunOnTabBtn'),
    model: document.getElementById('llmChatLocalModel') && document.getElementById('llmChatLocalModel').value,
    status: (document.getElementById('llmChatStatus') || {}).textContent || '',
    pages: 'sidepanel'
  })`);
  log('sidepanel ready', JSON.stringify(ready));

  await evalExpr(`
    const plan = document.querySelector('.header-tab[data-tab="automations"]');
    if (plan) plan.click();
    const model = document.getElementById('llmChatLocalModel');
    if (model) model.value = 'qwen34b';
    if (model) model.dispatchEvent(new Event('change', { bubbles: true }));
    const input = document.getElementById('llmChatInput');
    input.value = 'Search for tesla';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('llmChatRunOnTabBtn').click();
    'clicked';
  `);
  log('clicked Run on this tab');

  const started = Date.now();
  let last = '';
  let snapshot = null;
  while (Date.now() - started < 360000) {
    snapshot = await evalExpr(`({
      status: (document.getElementById('llmChatStatus') || {}).textContent || '',
      hidden: !!(document.getElementById('llmChatStatus') && document.getElementById('llmChatStatus').hidden),
      runDisabled: !!(document.getElementById('llmChatRunOnTabBtn') && document.getElementById('llmChatRunOnTabBtn').disabled),
      messages: (document.getElementById('llmChatMessages') || {}).innerText || ''
    })`);
    if (snapshot.status && snapshot.status !== last) {
      last = snapshot.status;
      log('status', snapshot.status, snapshot.runDisabled ? '(running)' : '');
    }
    if (/Done \(|not downloaded|failed|Planner reply was not|Could not read|Open a regular/i.test(snapshot.status || '')) {
      break;
    }
    await sleep(1000);
  }

  const targets = await fetch('http://127.0.0.1:' + PORT + '/json/list').then((r) => r.json()).catch(() => []);
  console.log(JSON.stringify({
    ok: /Done \(/i.test((snapshot && snapshot.status) || ''),
    status: snapshot && snapshot.status,
    messages: String((snapshot && snapshot.messages) || '').slice(0, 800),
    pages: targets.map((t) => t.type + ' ' + (t.url || '')),
    elapsedMs: Date.now() - started,
  }, null, 2));
  try { session.ws.close(); } catch (_) {}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
