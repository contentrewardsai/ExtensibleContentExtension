/**
 * Writes workflows/campaign-submit/workflow.json (Whop / Clipster / Reellu post-submit starters).
 * Run: node scripts/generate-campaign-submit-workflows.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'workflows', 'campaign-submit');

const WHOP_APP_URL =
  'https://whop.com/joined/content-rewards-ai/content-rewards-ai-1TBjBWdmGMbjk4/app/';
const CLIPSTER_ACTIVITY_URL = 'https://www.clipster.gg/activity/campaigns';
const REELLU_HOME_URL = 'https://reellu.com/';

function css(value, score = 9) {
  return { type: 'css', value, score };
}
function textSel(value, tag, score = 8) {
  return { type: 'text', value, tag, score };
}

function log(message, extra = {}) {
  return { type: 'logMessage', message, level: extra.level || 'info', ...(extra.saveAsVariable ? { saveAsVariable: extra.saveAsVariable } : {}) };
}

function waitMs(ms) {
  return { type: 'wait', waitFor: 'time', duration: ms };
}

function clickTexts(labels, extra = {}) {
  const primary = labels[0];
  const selectors = [];
  labels.forEach((label, i) => {
    selectors.push(textSel(label, extra.tag || 'button', Math.max(9 - i, 4)));
  });
  if (extra.css) selectors.push(css(extra.css, 4));
  return {
    type: 'click',
    selectors,
    fallbackTexts: labels,
    text: primary,
    requireTextMatch: extra.requireTextMatch === true,
    optional: extra.optional !== false,
    stepLabel: extra.stepLabel || 'Click: ' + primary,
  };
}

function typeUrlField(variableKey, extra = {}) {
  return {
    type: 'type',
    variableKey,
    reactCompat: true,
    optional: extra.optional !== false,
    stepLabel: extra.stepLabel || 'Type ' + variableKey + ' into URL/link field',
    selectors: [
      css('input[type="url"]', 9),
      css('input[name*="url"]', 8),
      css('input[name*="Url"]', 7),
      css('input[placeholder*="http"]', 8),
      css('input[placeholder*="URL"]', 8),
      css('input[placeholder*="url"]', 8),
      css('input[placeholder*="link"]', 7),
      css('textarea[placeholder*="http"]', 6),
      css('textarea[name*="url"]', 6),
      css('input[type="text"]', 3),
    ],
  };
}

function typeNotes(variableKey, extra = {}) {
  return {
    type: 'type',
    variableKey,
    reactCompat: true,
    optional: true,
    runIf: '{{' + variableKey + '}}',
    stepLabel: extra.stepLabel || 'Type ' + variableKey + ' if provided',
    selectors: extra.selectors || [
      css('textarea', 8),
      css('input[name*="note"]', 7),
      css('input[placeholder*="note"]', 6),
      css('input[placeholder*="caption"]', 6),
    ],
  };
}

function goToCampaignOrDefault(defaultUrl) {
  return {
    type: 'ifCondition',
    condition: '{{campaignUrl}}',
    stepLabel: 'Navigate to campaignUrl or default platform URL',
    thenSteps: [{ type: 'goToUrl', variableKey: 'campaignUrl' }],
    elseSteps: [{ type: 'goToUrl', url: defaultUrl }],
  };
}

function apiOrUi(uiSteps) {
  return {
    type: 'ifCondition',
    condition: '{{submitApiUrl}}',
    stepLabel: 'sendToEndpoint fallback when submitApiUrl is set; otherwise walk the web UI',
    thenSteps: [
      {
        type: 'sendToEndpoint',
        urlVariableKey: 'submitApiUrl',
        method: 'POST',
        bodySource: 'template',
        bodyContentType: 'json',
        bodyTemplate: JSON.stringify({
          postUrl: '{{postUrl}}',
          campaignId: '{{campaignId}}',
          notes: '{{notes}}',
          caption: '{{caption}}',
          proofScreenshot: '{{proofScreenshot}}',
        }),
        waitForResponse: true,
        saveAsVariable: 'submitApiResponse',
        saveStatusToVariable: 'submitApiStatus',
        successStatuses: '2xx',
        timeoutMs: 30000,
        retryCount: 0,
      },
      log('API submit finished. Status {{submitApiStatus}}. Confirm the response before assuming payout tracking started.'),
    ],
    elseSteps: uiSteps,
  };
}

function optionalProofUpload() {
  return {
    type: 'upload',
    variableKey: 'proofScreenshot',
    optional: true,
    runIf: '{{proofScreenshot}}',
    stepLabel: 'Attach proofScreenshot if the form has a file input (URL or hosted image; data URLs may fail)',
    selectors: [css('input[type="file"]', 9)],
  };
}

function extractPageHint() {
  return {
    type: 'extractData',
    listSelector: 'body',
    itemSelector: 'body',
    maxItems: 1,
    optional: true,
    stepLabel: 'Capture page title/text so you can confirm the submit UI actually opened',
    fields: [
      { key: 'pageTitle', selectors: [{ type: 'css', value: 'title', score: 9 }] },
      { key: 'heading', selectors: [{ type: 'css', value: 'h1', score: 8 }, { type: 'css', value: 'h2', score: 6 }] },
    ],
  };
}

const sharedAssert = {
  type: 'assertCondition',
  condition: '{{postUrl}}',
  errorMessage: 'postUrl is required (live social post URL after you published).',
};

function starterBanner(platform, confirmNote) {
  return log(
    platform +
      ' campaign submit starter. Selectors are unverified — if a click/type is skipped, use Select on page to refine. ' +
      confirmNote
  );
}

const whopUi = [
  starterBanner(
    'Whop Content Rewards',
    'You must already be signed into Whop. Default URL is CONTENT_REWARDS_AI_URL from config/whop-auth.example.js. Typical UI: open a campaign → Submit Video → paste post URL → attach media/proof → submit.'
  ),
  { type: 'getAccountStatus', saveAsVariable: 'accountStatus' },
  log('Whop login: {{accountStatus.loggedIn}}. If false, sign in via the extension Settings / Whop login first.'),
  goToCampaignOrDefault(WHOP_APP_URL),
  waitMs(2500),
  {
    type: 'waitForElement',
    state: 'visible',
    timeoutMs: 20000,
    optional: true,
    stepLabel: 'Wait for Content Rewards app chrome (unverified)',
    selectors: [
      textSel('Submit Video', 'button', 8),
      textSel('Submit', 'button', 5),
      textSel('My submissions', null, 6),
      css('input[type="url"]', 7),
    ],
  },
  {
    type: 'ensureOpen',
    optional: true,
    timeoutMs: 15000,
    afterOpenTimeoutMs: 6000,
    stepLabel: 'Open Submit Video (or Submit) if the URL field is not already visible',
    checkSelectors: [css('input[type="url"]', 9), css('input[placeholder*="http"]', 8)],
    openSelectors: [
      textSel('Submit Video', 'button', 9),
      textSel('Submit content', 'button', 7),
      textSel('Submit', 'button', 5),
    ],
  },
  waitMs(800),
  typeUrlField('postUrl', { stepLabel: 'Paste postUrl into the Whop submission URL field' }),
  typeNotes('notes', { stepLabel: 'Optional notes' }),
  typeNotes('caption', { stepLabel: 'Optional caption' }),
  optionalProofUpload(),
  clickTexts(['Submit Video', 'Submit', 'Confirm'], { stepLabel: 'Confirm submit (optional if already submitted)' }),
  waitMs(1500),
  extractPageHint(),
  log('Whop UI walk finished. Confirm the submission appears under My submissions. Refine selectors if the URL field or Submit Video control was skipped.'),
];

const clipsterUi = [
  starterBanner(
    'Clipster.gg',
    'Sign in at clipster.gg first. Typical path: dashboard / My Campaigns → Submit Content → paste social URL → Submit. Public docs do not freeze CSS class names.'
  ),
  goToCampaignOrDefault(CLIPSTER_ACTIVITY_URL),
  waitMs(2500),
  {
    type: 'waitForElement',
    state: 'visible',
    timeoutMs: 20000,
    optional: true,
    stepLabel: 'Wait for Clipster activity/campaign UI',
    selectors: [
      textSel('Submit Content', 'button', 8),
      textSel('Submit', 'button', 5),
      textSel('My Activity', null, 6),
      css('input[type="url"]', 7),
    ],
  },
  {
    type: 'ensureOpen',
    optional: true,
    timeoutMs: 15000,
    afterOpenTimeoutMs: 6000,
    stepLabel: 'Open Submit Content if the URL field is hidden',
    checkSelectors: [css('input[type="url"]', 9), css('input[placeholder*="http"]', 8)],
    openSelectors: [
      textSel('Submit Content', 'button', 9),
      textSel('Submit clip', 'button', 7),
      textSel('Submit', 'button', 5),
    ],
  },
  waitMs(800),
  typeUrlField('postUrl', { stepLabel: 'Paste postUrl into Clipster submit field' }),
  typeNotes('notes'),
  typeNotes('caption'),
  optionalProofUpload(),
  clickTexts(['Submit Content', 'Submit', 'Confirm'], { stepLabel: 'Confirm Clipster submit' }),
  waitMs(1500),
  extractPageHint(),
  log('Clipster UI walk finished. Confirm the row appears under Activity → Submissions. Update selectors via Select on page if needed.'),
];

const reelluUi = [
  starterBanner(
    'Reellu.com',
    'Homepage exposes a clip URL field plus optional Solana wallet. Sign in / join-clipper first. walletAddress row field is typed when present. Selectors are starter-only.'
  ),
  goToCampaignOrDefault(REELLU_HOME_URL),
  waitMs(2500),
  {
    type: 'waitForElement',
    state: 'visible',
    timeoutMs: 20000,
    optional: true,
    stepLabel: 'Wait for Reellu submit form',
    selectors: [
      textSel('Submit a clip', null, 8),
      css('input[type="url"]', 8),
      css('input[placeholder*="tiktok"]', 7),
      css('input[placeholder*="Solana"]', 6),
    ],
  },
  waitMs(500),
  typeUrlField('postUrl', { stepLabel: 'Paste clip/post URL' }),
  {
    type: 'type',
    variableKey: 'walletAddress',
    reactCompat: true,
    optional: true,
    runIf: '{{walletAddress}}',
    stepLabel: 'Optional Solana wallet (USDC payout) if the form asks',
    selectors: [
      css('input[placeholder*="Solana"]', 9),
      css('input[placeholder*="wallet"]', 8),
      css('input[name*="wallet"]', 8),
    ],
  },
  typeNotes('notes'),
  typeNotes('caption'),
  optionalProofUpload(),
  clickTexts(['Submit a clip', 'Submit clip', 'Submit'], { stepLabel: 'Confirm Reellu submit' }),
  waitMs(1500),
  extractPageHint(),
  log('Reellu UI walk finished. Confirm the clip shows on the clipper dashboard. Refine selectors if the form fields were skipped.'),
];

function wrapPlatform(id, name, origin, uiSteps) {
  return {
    id,
    name,
    version: 1,
    initial_version: id,
    description:
      'Starter campaign-submit after a social post exists. Row: postUrl (required), optional proofScreenshot, campaignId, notes, caption, campaignUrl, submitApiUrl. Selectors are unverified — refine on a live page.',
    urlPattern: { origin, pathPattern: '*' },
    analyzed: {
      actions: [sharedAssert, apiOrUi(uiSteps)],
    },
  };
}

const parent = {
  id: 'wf_campaign_submit',
  name: 'Campaign submit (Whop / Clipster / Reellu)',
  version: 1,
  initial_version: 'wf_campaign_submit',
  description:
    'Parent orchestrator. Set platform to clipster, reellu, or omit/whop. Same row schema as the child workflows. Invoke after the social post URL exists.',
  urlPattern: { origin: 'https://whop.com', pathPattern: '*' },
  analyzed: {
    actions: [
      sharedAssert,
      log(
        'Routing campaign submit. platform={{platform}} postUrl={{postUrl}}. Children: wf_whop_content_rewards_submit, wf_clipster_submit, wf_reellu_submit.'
      ),
      {
        type: 'ifCondition',
        condition: '{{platform}} === "clipster"',
        stepLabel: 'Clipster when platform is clipster',
        thenSteps: [{ type: 'runWorkflow', workflowId: 'wf_clipster_submit' }],
        elseSteps: [
          {
            type: 'ifCondition',
            condition: '{{platform}} === "reellu"',
            stepLabel: 'Reellu when platform is reellu',
            thenSteps: [{ type: 'runWorkflow', workflowId: 'wf_reellu_submit' }],
            elseSteps: [{ type: 'runWorkflow', workflowId: 'wf_whop_content_rewards_submit' }],
          },
        ],
      },
    ],
  },
};

const plugin = {
  id: 'campaign-submit',
  name: 'Campaign submit (Whop, Clipster, Reellu)',
  version: '1',
  description:
    'After a social post exists, submit the live URL to Whop Content Rewards, Clipster.gg, or Reellu.com. Starter selectors — confirm on a live signed-in session.',
  discovery: {
    domains: ['whop.com', 'www.clipster.gg', 'clipster.gg', 'reellu.com'],
  },
  rowSchema: {
    postUrl: { required: true, description: 'Live social post URL (TikTok, Reels, Shorts, X, etc.)' },
    proofScreenshot: {
      required: false,
      description: 'Optional image URL for file inputs (capture_tab_screenshot file path is not a fetchable URL unless hosted)',
    },
    campaignId: { required: false, description: 'Platform campaign id when the UI or API needs it' },
    notes: { required: false, description: 'Optional notes' },
    caption: { required: false, description: 'Optional caption' },
    platform: { required: false, description: 'whop (default) | clipster | reellu — used by wf_campaign_submit' },
    campaignUrl: { required: false, description: 'Override destination URL (specific campaign page)' },
    submitApiUrl: { required: false, description: 'If set, POST JSON there instead of walking the web UI' },
    walletAddress: { required: false, description: 'Reellu Solana USDC payout address when the form asks' },
  },
  workflows: {
    wf_campaign_submit: parent,
    wf_whop_content_rewards_submit: wrapPlatform(
      'wf_whop_content_rewards_submit',
      'Whop Content Rewards submit',
      'https://whop.com',
      whopUi
    ),
    wf_clipster_submit: wrapPlatform('wf_clipster_submit', 'Clipster.gg submit', 'https://www.clipster.gg', clipsterUi),
    wf_reellu_submit: wrapPlatform('wf_reellu_submit', 'Reellu.com submit', 'https://reellu.com', reelluUi),
  },
};

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'workflow.json');
fs.writeFileSync(outPath, JSON.stringify(plugin, null, 2) + '\n');
console.log('Wrote ' + outPath);
