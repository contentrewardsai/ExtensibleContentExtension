/**
 * Writes workflows/ghl-design-import/workflow.json (GHL design → HighLevel family).
 * Run: node scripts/generate-ghl-design-import-workflows.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'workflows', 'ghl-design-import');
const blankPath = path.join(root, 'workflows', 'ghl-blank-website-test', 'workflow.json');
const planPath = path.join(root, 'test', 'fixtures', 'floratrack-plan.json');

const FRAME = {
  inIframe: true,
  frameOrigin: 'https://page-builder.leadconnectorhq.com',
};

const GHL_ORIGIN = {
  origin: 'https://app.gohighlevel.com',
  pathPattern: '*',
};

function css(value, score = 9) {
  return { type: 'css', value, score };
}
function textSel(value, tag, score = 8) {
  return { type: 'text', value, tag, score };
}

function wait(ms) {
  return { type: 'wait', waitMs: ms };
}

function clickText(label, extra = {}) {
  return {
    type: 'click',
    selectors: [textSel(label, extra.tag || 'button'), css(extra.css || 'button', 4)],
    fallbackTexts: [label],
    text: label,
    requireTextMatch: extra.requireTextMatch !== false,
    ...iframeIf(extra.iframe),
    ...(extra.runIf ? { runIf: extra.runIf } : {}),
  };
}

function iframeIf(on) {
  return on ? { ...FRAME } : {};
}

function ensureElementsOpen() {
  return {
    type: 'ensureOpen',
    checkSelectors: [css('#hl-menu-item-elements'), textSel('Elements', 'button')],
    openSelectors: [css('#hl-builder-add-elements-button')],
    text: 'Elements',
    timeoutMs: 15000,
    afterOpenTimeoutMs: 8000,
    ...FRAME,
  };
}

function clickMenu(id, label) {
  return {
    type: 'click',
    selectors: [css(id), textSel(label, 'button')],
    fallbackTexts: [label],
    text: label,
    requireTextMatch: true,
    ...FRAME,
  };
}

function dragCard(cardName) {
  return {
    type: 'dragDrop',
    sourceSelectors: [textSel(cardName, '.gui__builder-card'), css('.gui__builder-card', 5)],
    targetSelectors: [css('.empty-component', 8), css('.empty-slot', 6)],
    sourceText: cardName,
    text: cardName,
    steps: 20,
    stepDelayMs: 16,
    ...FRAME,
  };
}

function typeIntoEditor(variableKey, recordedValue) {
  return {
    type: 'type',
    selectors: [css('.tiptap.ProseMirror', 8)],
    variableKey,
    recordedValue,
    reactCompat: true,
    ...FRAME,
  };
}

function saveBuilder() {
  return {
    type: 'click',
    selectors: [css('#pg-website-builder__btn--save'), css('.hl-builder-save-button', 8)],
    fallbackTexts: ['Save'],
    text: 'Save',
    ...FRAME,
  };
}

function placeFamily(cardName, opts = {}) {
  const actions = [
    ensureElementsOpen(),
    wait(300),
    clickMenu('#hl-menu-item-elements', 'Elements'),
    wait(400),
    dragCard(cardName),
    wait(1000),
  ];
  if (opts.clickPlaceholder) {
    actions.push({
      type: 'click',
      selectors: [textSel(opts.clickPlaceholder, opts.placeholderTag || '*', 8)],
      fallbackTexts: [opts.clickPlaceholder],
      text: opts.clickPlaceholder,
      requireTextMatch: true,
      ...FRAME,
    });
  }
  if (opts.variableKey) {
    actions.push(typeIntoEditor(opts.variableKey, opts.recordedValue || ''));
    actions.push(wait(300));
  }
  if (opts.extra) actions.push(...opts.extra);
  actions.push(saveBuilder());
  return actions;
}

const blank = JSON.parse(fs.readFileSync(blankPath, 'utf8'));
const blankActions = blank.workflows.wf_ghl_blank_website_test.analyzed.actions;
const bootstrapActions = blankActions.filter((a) => {
  if (a.type === 'dragDrop') return false;
  if (a.type === 'type' && a.variableKey === 'headline') return false;
  if (a.text === 'Add a Title Here') return false;
  if (a.text === 'Save' && a.selectors && JSON.stringify(a.selectors).includes('pg-website-builder')) return false;
  return true;
});

function wf(id, name, actions, extra = {}) {
  return {
    id,
    name,
    version: 1,
    initial_version: id,
    urlPattern: GHL_ORIGIN,
    csvColumns: extra.csvColumns || [],
    analyzed: { actions },
    ...extra.rest,
  };
}

const BLOCK_MAP = {
  text: 'block.text',
  sectionLayout: 'block.sectionLayout',
  background: 'block.style.background',
  color: 'block.style.color',
  fontSize: 'block.style.fontSize',
  imageUrl: 'block.imageUrl',
  html: 'block.html',
  formName: 'block.formName',
  fields: 'block.fields',
  videoUrl: 'block.videoUrl',
  address: 'block.address',
  calendarId: 'block.calendarId',
};

function runChild(workflowId, extraMap) {
  return {
    type: 'runWorkflow',
    workflowId,
    rowMapping: { ...BLOCK_MAP, ...(extraMap || {}) },
  };
}

function ifGhl(value, thenSteps, elseSteps) {
  return {
    type: 'ifCondition',
    condition: '{{block.ghl}} === ' + value,
    thenSteps,
    elseSteps: elseSteps || [],
  };
}

const floratrackPlan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const analyzeActions = [
  {
    type: 'goToUrl',
    variableKey: 'sourceUrl',
    runIf: '{{sourceUrl}}',
  },
  {
    type: 'extractComputedStyles',
    saveAsVariable: 'sourceSnapshot',
    regions: [
      { id: 'root', selector: 'body' },
      { id: 'nav', selector: 'nav' },
    ],
  },
  {
    type: 'llm',
    runIf: '{{analyzeWithLlm}}',
    prompt:
      'Turn this page snapshot into a HighLevel block plan. Reply JSON only: {"blocks":[{"id":"...","ghl":"section|columns|headline|text|image|button|form|survey|video|divider|nav|footer|list|quote|pricing|faq|countdown|map|slider|popup|social|calendar|html","text":"...","sectionLayout":"fullWidth|2col|3col","style":{"background":"#hex","color":"#hex","fontSize":"20px"},"imageUrl":"","formName":"","fields":[{"label":"","type":"text"}]}]}. ' +
      'Collect-info regions must be ghl form or survey, never html. Visual-only leftovers use html with no form/input/select/textarea.\nSnapshot:\n{{sourceSnapshot.text}}',
    responseType: 'text',
    saveAsVariable: 'planJson',
  },
];

const sectionActions = [
  clickMenu('#hl-menu-item-rows', 'Rows'),
  wait(400),
  {
    type: 'dragDrop',
    sourceSelectors: [textSel('1 Column', '.gui__builder-card'), textSel('Full Width', '.gui__builder-card'), css('.gui__builder-card', 5)],
    targetSelectors: [css('.empty-component', 8), css('.empty-slot', 6)],
    sourceText: '1 Column',
    text: '1 Column',
    steps: 20,
    stepDelayMs: 16,
    runIf: '{{sectionLayout}} !== 2col',
    ...FRAME,
  },
  {
    type: 'dragDrop',
    sourceSelectors: [textSel('2 Column', '.gui__builder-card'), textSel('2 Columns', '.gui__builder-card'), css('.gui__builder-card', 5)],
    targetSelectors: [css('.empty-component', 8), css('.empty-slot', 6)],
    sourceText: '2 Column',
    text: '2 Column',
    steps: 20,
    stepDelayMs: 16,
    runIf: '{{sectionLayout}} === 2col',
    ...FRAME,
  },
  wait(600),
  saveBuilder(),
];

const columnsActions = [
  clickMenu('#hl-menu-item-rows', 'Rows'),
  wait(400),
  {
    type: 'dragDrop',
    sourceSelectors: [textSel('3 Column', '.gui__builder-card'), textSel('3 Columns', '.gui__builder-card'), css('.gui__builder-card', 5)],
    targetSelectors: [css('.empty-component', 8), css('.empty-slot', 6)],
    sourceText: '3 Column',
    text: '3 Column',
    steps: 20,
    stepDelayMs: 16,
    runIf: '{{sectionLayout}} !== 2col',
    ...FRAME,
  },
  {
    type: 'dragDrop',
    sourceSelectors: [textSel('2 Column', '.gui__builder-card'), textSel('2 Columns', '.gui__builder-card'), css('.gui__builder-card', 5)],
    targetSelectors: [css('.empty-component', 8), css('.empty-slot', 6)],
    sourceText: '2 Column',
    text: '2 Column',
    steps: 20,
    stepDelayMs: 16,
    runIf: '{{sectionLayout}} === 2col',
    ...FRAME,
  },
  wait(600),
  saveBuilder(),
];

const htmlGuard = {
  type: 'assertCondition',
  condition: '{{html}} !== <form',
  errorMessage: 'wf_ghl_place_html rejects form markup. Use wf_ghl_ensure_form instead.',
};

const imageExtra = [
  {
    type: 'click',
    selectors: [css('img', 6), textSel('Add Image', '*', 5)],
    text: 'image',
    optional: true,
    ...FRAME,
  },
  {
    type: 'type',
    selectors: [
      css('input[placeholder*="http"]', 8),
      css('input[type="url"]', 7),
      css('input[placeholder*="URL"]', 6),
    ],
    variableKey: 'imageUrl',
    recordedValue: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=400',
    reactCompat: true,
    optional: true,
    ...FRAME,
  },
];

const applyStyleActions = [
  {
    type: 'click',
    selectors: [css('.pg-element-selected', 6), css('h1', 4)],
    optional: true,
    ...FRAME,
  },
  {
    type: 'type',
    selectors: [css('input[type="color"]', 6), css('[data-testid*="color"]', 5)],
    variableKey: 'color',
    optional: true,
    ...FRAME,
  },
  saveBuilder(),
];

const ensureFormActions = [
  {
    type: 'click',
    selectors: [textSel('Sites', '*', 7), css('[href*="sites"]', 6)],
    fallbackTexts: ['Sites'],
    text: 'Sites',
    optional: true,
  },
  wait(600),
  {
    type: 'click',
    selectors: [textSel('Forms', '*', 8), css('[href*="form"]', 6)],
    fallbackTexts: ['Forms', 'Surveys'],
    text: 'Forms',
  },
  wait(800),
  {
    type: 'click',
    selectors: [
      textSel('Create New Form', 'button', 8),
      textSel('Create form', 'button', 7),
      css('#create-new-button', 6),
    ],
    fallbackTexts: ['Create New Form', 'Create form', 'New form'],
    text: 'Create New Form',
    optional: true,
  },
  wait(600),
  {
    type: 'type',
    selectors: [css('#name', 8), css('input[placeholder*="name" i]', 6)],
    variableKey: 'formName',
    recordedValue: 'Add Plant',
    reactCompat: true,
  },
  wait(400),
  {
    type: 'click',
    selectors: [textSel('Save', 'button', 6), css('[data-testid*="save"]', 5)],
    fallbackTexts: ['Save', 'Create'],
    text: 'Save',
    optional: true,
  },
];

const placeFormActions = placeFamily('Form', { extra: [] });

const familyCard = {
  video: 'Video',
  divider: 'Divider',
  nav: 'Navigation',
  footer: 'Footer',
  list: 'List',
  quote: 'Testimonial',
  pricing: 'Pricing',
  faq: 'FAQ',
  countdown: 'Countdown',
  map: 'Map',
  slider: 'Slider',
  popup: 'Popup',
  social: 'Social',
  calendar: 'Calendar',
};

const workflows = {
  wf_ghl_site_bootstrap: wf('wf_ghl_site_bootstrap', 'GHL site bootstrap', bootstrapActions, {
    csvColumns: ['websiteName', 'pageName'],
  }),
  wf_ghl_analyze_source: wf('wf_ghl_analyze_source', 'GHL analyze source', analyzeActions, {
    csvColumns: ['sourceUrl', 'sourceHtml'],
  }),
  wf_ghl_place_section: wf('wf_ghl_place_section', 'GHL place section', sectionActions, {
    csvColumns: ['sectionLayout', 'background'],
  }),
  wf_ghl_place_columns: wf('wf_ghl_place_columns', 'GHL place columns', columnsActions, {
    csvColumns: ['sectionLayout'],
  }),
  wf_ghl_place_headline: wf(
    'wf_ghl_place_headline',
    'GHL place headline',
    placeFamily('Headline', { clickPlaceholder: 'Add a Title Here', placeholderTag: 'h1', variableKey: 'text', recordedValue: 'Headline' }),
    { csvColumns: ['text', 'color', 'fontSize'] }
  ),
  wf_ghl_place_text: wf(
    'wf_ghl_place_text',
    'GHL place text',
    placeFamily('Paragraph', { clickPlaceholder: 'Add your text here', variableKey: 'text', recordedValue: 'Body' }),
    { csvColumns: ['text', 'color', 'fontSize'] }
  ),
  wf_ghl_place_image: wf(
    'wf_ghl_place_image',
    'GHL place image',
    placeFamily('Image', { extra: imageExtra }),
    { csvColumns: ['imageUrl'] }
  ),
  wf_ghl_place_button: wf(
    'wf_ghl_place_button',
    'GHL place button',
    placeFamily('Button', { clickPlaceholder: 'Button', variableKey: 'text', recordedValue: 'Add Plant' }),
    { csvColumns: ['text', 'background', 'color'] }
  ),
  wf_ghl_apply_style: wf('wf_ghl_apply_style', 'GHL apply style', applyStyleActions, {
    csvColumns: ['color', 'background', 'fontSize'],
  }),
  wf_ghl_place_html: wf(
    'wf_ghl_place_html',
    'GHL place HTML (visual only)',
    [htmlGuard, ...placeFamily('Code', { extra: [{ type: 'type', selectors: [css('textarea', 6), css('.cm-content', 5)], variableKey: 'html', optional: true, ...FRAME }] })],
    { csvColumns: ['html'] }
  ),
  wf_ghl_ensure_form: wf('wf_ghl_ensure_form', 'GHL ensure form', ensureFormActions, {
    csvColumns: ['formName', 'fields', 'kind'],
  }),
  wf_ghl_place_form: wf('wf_ghl_place_form', 'GHL place form', placeFormActions, {
    csvColumns: ['formName'],
  }),
};

for (const [key, card] of Object.entries(familyCard)) {
  const id = 'wf_ghl_place_' + key;
  workflows[id] = wf(id, 'GHL place ' + key, placeFamily(card, { variableKey: key === 'video' ? 'videoUrl' : key === 'map' ? 'address' : key === 'calendar' ? 'calendarId' : undefined }), {
    csvColumns: ['text', 'videoUrl', 'address', 'calendarId'],
  });
}

const loopSteps = [
  ifGhl('section', [runChild('wf_ghl_place_section')]),
  ifGhl('columns', [runChild('wf_ghl_place_columns')]),
  ifGhl('headline', [runChild('wf_ghl_place_headline')]),
  ifGhl('text', [runChild('wf_ghl_place_text')]),
  ifGhl('image', [runChild('wf_ghl_place_image')]),
  ifGhl('button', [runChild('wf_ghl_place_button')]),
  ifGhl('form', [runChild('wf_ghl_ensure_form'), runChild('wf_ghl_place_form')]),
  ifGhl('survey', [runChild('wf_ghl_ensure_form'), runChild('wf_ghl_place_form')]),
  ifGhl('html', [runChild('wf_ghl_place_html')]),
  ifGhl('video', [runChild('wf_ghl_place_video')]),
  ifGhl('divider', [runChild('wf_ghl_place_divider')]),
  ifGhl('nav', [runChild('wf_ghl_place_nav')]),
  ifGhl('footer', [runChild('wf_ghl_place_footer')]),
  ifGhl('list', [runChild('wf_ghl_place_list')]),
  ifGhl('quote', [runChild('wf_ghl_place_quote')]),
  ifGhl('pricing', [runChild('wf_ghl_place_pricing')]),
  ifGhl('faq', [runChild('wf_ghl_place_faq')]),
  ifGhl('countdown', [runChild('wf_ghl_place_countdown')]),
  ifGhl('map', [runChild('wf_ghl_place_map')]),
  ifGhl('slider', [runChild('wf_ghl_place_slider')]),
  ifGhl('popup', [runChild('wf_ghl_place_popup')]),
  ifGhl('social', [runChild('wf_ghl_place_social')]),
  ifGhl('calendar', [runChild('wf_ghl_place_calendar')]),
];

workflows.wf_ghl_design_correct = wf(
  'wf_ghl_design_correct',
  'GHL design correct',
  [
    {
      type: 'loop',
      listVariable: 'compare.failures',
      itemVariable: 'item',
      indexVariable: 'itemIndex',
      steps: [
        {
          type: 'ifCondition',
          condition: '{{item.type}} === colorDelta',
          thenSteps: [runChild('wf_ghl_apply_style')],
        },
        {
          type: 'ifCondition',
          condition: '{{item.type}} === missingFormField',
          thenSteps: [runChild('wf_ghl_ensure_form')],
        },
        {
          type: 'ifCondition',
          condition: '{{item.type}} === missingText',
          thenSteps: [runChild('wf_ghl_place_text')],
        },
        {
          type: 'ifCondition',
          condition: '{{item.type}} === layout',
          thenSteps: [runChild('wf_ghl_place_html')],
        },
      ],
    },
  ],
  { csvColumns: ['compare', 'formName'] }
);

workflows.wf_ghl_design_import = wf(
  'wf_ghl_design_import',
  'GHL design import',
  [
    {
      type: 'runWorkflow',
      workflowId: 'wf_ghl_analyze_source',
      runIf: '{{sourceUrl}}',
    },
    { type: 'runWorkflow', workflowId: 'wf_ghl_site_bootstrap' },
    {
      type: 'loop',
      listVariable: 'plan.blocks',
      itemVariable: 'block',
      indexVariable: 'blockIndex',
      flattenChildren: true,
      steps: loopSteps,
    },
    {
      type: 'extractComputedStyles',
      saveAsVariable: 'previewSnapshot',
      regions: [{ id: 'root', selector: 'body' }],
      ...FRAME,
    },
    {
      type: 'comparePages',
      sourceVariable: 'sourceSnapshot',
      previewVariable: 'previewSnapshot',
      planVariable: 'plan',
      saveAsVariable: 'compare',
    },
    {
      type: 'ifCondition',
      condition: '{{compare.pass}} !== true',
      thenSteps: [
        {
          type: 'ifCondition',
          condition: '{{fixPass}} < {{maxFixPasses}}',
          thenSteps: [{ type: 'runWorkflow', workflowId: 'wf_ghl_design_correct' }],
        },
      ],
    },
    saveBuilder(),
  ],
  {
    csvColumns: ['websiteName', 'pageName', 'sourceUrl', 'sourceHtml', 'maxFixPasses', 'fixPass'],
  }
);

const plugin = {
  id: 'ghl-design-import',
  name: 'GHL design import',
  version: '1',
  description:
    'Turn a source URL or static HTML snapshot into a HighLevel website: bootstrap, native placers, Forms/Surveys for collect-info, HTML visual fallback, compare + one correction pass.',
  workflows,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'workflow.json'), JSON.stringify(plugin, null, 2) + '\n');
console.log('Wrote', Object.keys(workflows).length, 'workflows to', path.relative(root, path.join(outDir, 'workflow.json')));
console.log('Floratrack blocks:', floratrackPlan.blocks.length);
