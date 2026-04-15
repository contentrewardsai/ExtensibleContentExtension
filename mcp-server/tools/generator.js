/**
 * MCP Tools — Generator / Template management
 *
 * Provides tools to list, create, edit, and render templates.
 * Rendering supports three modes:
 *   1. Local (PixiJS + MediaRecorder + FFmpeg WASM — same as the Export button)
 *   2. ShotStack staging (watermarked)
 *   3. ShotStack production
 */
import { z } from 'zod';

/* ── Presets (embedded copy of output-presets.json for quick list_presets) ── */
const OUTPUT_PRESETS = [
  { id: 'youtube_16_9', label: 'YouTube (16:9)', aspectRatio: '16:9', width: 1920, height: 1080 },
  { id: 'instagram_square', label: 'Instagram square (1:1)', aspectRatio: '1:1', width: 1080, height: 1080 },
  { id: 'instagram_portrait', label: 'Instagram portrait (4:5)', aspectRatio: '4:5', width: 1080, height: 1350 },
  { id: 'instagram_story', label: 'Instagram / Facebook story (9:16)', aspectRatio: '9:16', width: 1080, height: 1920 },
  { id: 'tiktok_9_16', label: 'TikTok (9:16)', aspectRatio: '9:16', width: 1080, height: 1920 },
  { id: 'twitter_16_9', label: 'Twitter / X video (16:9)', aspectRatio: '16:9', width: 1280, height: 720 },
  { id: 'linkedin_1_91_1', label: 'LinkedIn (1.91:1)', aspectRatio: '1.91:1', width: 1200, height: 628 },
  { id: 'linkedin_square', label: 'LinkedIn square (1:1)', aspectRatio: '1:1', width: 1080, height: 1080 },
  { id: 'sd_16_9', label: 'SD 16:9 (720p)', aspectRatio: '16:9', width: 1280, height: 720 },
  { id: 'hd_16_9', label: 'HD 16:9 (1080p)', aspectRatio: '16:9', width: 1920, height: 1080 },
  { id: 'custom', label: 'Custom', aspectRatio: null, width: null, height: null },
  { id: 'audio_default', label: 'Audio (default)', aspectRatio: null, width: 1920, height: 1080 },
];

const RESOLUTION_BASES = { sd: 480, hd: 720, fhd: 1080, '4k': 2160 };
const ASPECT_RATIOS = { '1:1': [1, 1], '16:9': [16, 9], '9:16': [9, 16], '4:5': [4, 5] };

function resolveDimensions(opts) {
  if (opts.presetId && opts.presetId !== 'custom') {
    const p = OUTPUT_PRESETS.find((pr) => pr.id === opts.presetId);
    if (p && p.width && p.height) return { width: p.width, height: p.height };
  }
  if (opts.resolution && opts.aspectRatio) {
    const base = RESOLUTION_BASES[opts.resolution];
    const ratio = ASPECT_RATIOS[opts.aspectRatio];
    if (base && ratio) {
      const [rw, rh] = ratio;
      if (rw >= rh) return { width: Math.round(base * rw / rh), height: base };
      return { width: base, height: Math.round(base * rh / rw) };
    }
  }
  return { width: opts.width || 1080, height: opts.height || 1080 };
}

/** Build a minimal ShotStack-compatible template JSON. */
function buildBlankTemplate(opts) {
  const { width, height } = resolveDimensions(opts);
  const outputType = opts.outputType || 'image';
  const fps = opts.fps || 25;
  const duration = opts.duration || 10;
  const bg = opts.background || '#ffffff';
  const format = outputType === 'video' ? 'mp4' : outputType === 'audio' ? 'mp3' : 'png';

  const templateId = opts.templateId || 'new-template';
  const name = opts.name || templateId;

  return {
    merge: [
      { find: '__CFS_TEMPLATE_ID', replace: templateId },
      { find: '__CFS_TEMPLATE_NAME', replace: name },
      { find: '__CFS_DESCRIPTION', replace: opts.description || '' },
      { find: '__CFS_OUTPUT_TYPE', replace: outputType },
      { find: '__CFS_PRESET_ID', replace: opts.presetId || 'custom' },
      { find: '__CFS_INPUT_SCHEMA', replace: '[]' },
    ],
    output: {
      format,
      fps,
      resolution: 'hd',
      size: { width, height },
    },
    timeline: {
      background: bg,
      tracks: [],
    },
  };
}

/** Build a ShotStack clip from the add_template_layer properties. */
function buildClipFromLayer(layer) {
  const start = layer.start ?? 0;
  const length = layer.length ?? 10;
  const position = layer.position || 'center';
  const alias = layer.alias || undefined;
  const layerType = layer.layerType;
  const props = layer.properties || {};

  let asset;
  switch (layerType) {
    case 'text':
      asset = {
        type: 'rich-text',
        text: alias ? `{{ ${alias} }}` : (props.text || 'New Text'),
        font: {
          family: props.fontFamily || 'Open Sans',
          size: props.fontSize || 36,
          color: props.color || '#000000',
        },
      };
      if (props.fontWeight) asset.font.weight = props.fontWeight;
      if (props.animation) asset.animation = props.animation;
      if (props.align) asset.align = props.align;
      if (props.padding) asset.padding = props.padding;
      if (props.lineHeight) { asset.style = asset.style || {}; asset.style.lineHeight = props.lineHeight; }
      break;

    case 'image':
      asset = {
        type: 'image',
        src: alias ? `{{ ${alias} }}` : (props.src || ''),
      };
      break;

    case 'video':
      asset = {
        type: 'video',
        src: alias ? `{{ ${alias} }}` : (props.src || ''),
      };
      if (props.volume != null) asset.volume = props.volume;
      break;

    case 'audio':
      asset = {
        type: 'audio',
        src: alias ? `{{ ${alias} }}` : (props.src || ''),
      };
      if (props.volume != null) asset.volume = props.volume;
      break;

    case 'shape': {
      const shape = props.shape || 'rectangle';
      asset = {
        type: 'shape',
        shape,
        fill: { color: props.fill || '#eeeeee' },
      };
      if (shape === 'rectangle') {
        asset.rectangle = {
          width: props.width || 200,
          height: props.height || 200,
          cornerRadius: props.cornerRadius || 0,
        };
      } else if (shape === 'circle') {
        asset.circle = { radius: props.radius || 50 };
      } else if (shape === 'line') {
        asset.line = { length: props.width || 200, thickness: props.height || 4 };
      }
      if (props.stroke) asset.stroke = props.stroke;
      break;
    }

    case 'caption':
      asset = {
        type: 'caption',
        src: props.src || '',
      };
      break;

    case 'svg':
      asset = {
        type: 'svg',
        src: props.svg || props.src || '',
      };
      break;

    case 'html':
      asset = {
        type: 'html',
        html: props.html || '<div></div>',
        css: props.css || '',
        width: props.width || 400,
        height: props.height || 300,
      };
      break;

    default:
      asset = { type: 'rich-text', text: props.text || '' };
  }

  const clip = { asset, start, length, position };
  if (alias) clip.alias = alias;
  if (layer.offset) clip.offset = layer.offset;
  if (layer.width != null) clip.width = layer.width;
  if (layer.height != null) clip.height = layer.height;
  if (props.fit) clip.fit = props.fit;
  if (props.opacity != null) clip.opacity = props.opacity;
  if (props.transition) clip.transition = props.transition;
  if (props.effect) clip.effect = props.effect;

  /* Add merge entry for aliased clips */
  let mergeEntry = null;
  if (alias) {
    const defaultVal =
      props.text || props.src || props.html || props.svg || props.fill || '';
    mergeEntry = { find: alias, replace: defaultVal };
  }

  return { clip, mergeEntry };
}

/** Find a clip by alias or track/clip index. Returns { trackIdx, clipIdx, clip } or null. */
function findClip(template, identifier) {
  const tracks = template?.timeline?.tracks || [];
  if (identifier.alias) {
    const upper = identifier.alias.toUpperCase().replace(/\s+/g, '_');
    for (let ti = 0; ti < tracks.length; ti++) {
      const clips = tracks[ti].clips || [];
      for (let ci = 0; ci < clips.length; ci++) {
        const c = clips[ci];
        if (c.alias && c.alias.toUpperCase().replace(/\s+/g, '_') === upper) {
          return { trackIdx: ti, clipIdx: ci, clip: c };
        }
      }
    }
    return null;
  }
  const ti = identifier.trackIndex ?? 0;
  const ci = identifier.clipIndex ?? 0;
  if (tracks[ti] && tracks[ti].clips && tracks[ti].clips[ci]) {
    return { trackIdx: ti, clipIdx: ci, clip: tracks[ti].clips[ci] };
  }
  return null;
}

/** Summarise a clip for list_template_layers. */
function summariseClip(clip, trackIdx, clipIdx) {
  const asset = clip.asset || {};
  return {
    trackIndex: trackIdx,
    clipIndex: clipIdx,
    alias: clip.alias || null,
    type: asset.type || 'unknown',
    start: clip.start,
    length: clip.length,
    position: clip.position || 'center',
    text: asset.text != null ? String(asset.text).slice(0, 80) : undefined,
    src: asset.src != null ? String(asset.src).slice(0, 120) : undefined,
    shape: asset.shape || undefined,
    fillColor: asset.fill?.color || asset.fill || undefined,
    fontFamily: asset.font?.family || undefined,
    fontSize: asset.font?.size || undefined,
  };
}

/* ── Register all generator/template tools ── */

export function registerGeneratorTools(server, ctx) {

  /* ── list_templates ── */
  server.tool(
    'list_templates',
    'List all available generator templates (built-in and project). Returns template IDs, names, and output types.',
    {
      projectId: z.string().optional().describe('Project ID to include project-scoped templates'),
    },
    async ({ projectId }) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_LIST_TEMPLATES',
        projectId: projectId || '',
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── get_template ── */
  server.tool(
    'get_template',
    'Load a template\'s full JSON, metadata (output config, merge fields), and layer summary.',
    {
      templateId: z.string().describe('Template ID (e.g. "ad-apple-notes")'),
      projectId: z.string().optional().describe('Project ID for project-scoped templates'),
    },
    async ({ templateId, projectId }) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_GET_TEMPLATE',
        templateId,
        projectId: projectId || '',
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── create_template ── */
  server.tool(
    'create_template',
    'Create a new blank template with specified output configuration. Saves to the project folder.',
    {
      templateId: z.string().describe('Template ID (becomes the filename)'),
      projectId: z.string().describe('Project ID to save in'),
      name: z.string().optional().describe('Human-readable template name'),
      description: z.string().optional().describe('Template description'),
      outputType: z.enum(['image', 'video', 'audio']).describe('Output format type'),
      width: z.number().int().min(1).optional().describe('Canvas width in pixels (default 1080)'),
      height: z.number().int().min(1).optional().describe('Canvas height in pixels (default 1080)'),
      presetId: z.string().optional().describe('Named preset (e.g. "youtube_16_9"). Overrides width/height.'),
      aspectRatio: z.string().optional().describe('Aspect ratio (e.g. "16:9"). Used with resolution.'),
      resolution: z.string().optional().describe('Resolution base (sd/hd/fhd/4k). Used with aspectRatio.'),
      fps: z.number().int().min(1).max(60).optional().describe('Framerate for video (default 25)'),
      background: z.string().optional().describe('Background color hex (default "#ffffff")'),
      duration: z.number().optional().describe('Timeline duration in seconds (default 10)'),
    },
    async (args) => {
      const template = buildBlankTemplate(args);
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_SAVE_TEMPLATE',
        templateId: args.templateId,
        projectId: args.projectId,
        templateJson: template,
        overwrite: false,
      });
      if (res.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            templateId: args.templateId,
            projectId: args.projectId,
            outputType: args.outputType,
            size: template.output.size,
            message: `Template "${args.templateId}" created. Use add_template_layer to add content, save_template to persist changes.`,
          }, null, 2) }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: true };
    }
  );

  /* ── set_template_output ── */
  server.tool(
    'set_template_output',
    'Change a template\'s format type (image/video/audio), resolution, aspect ratio, preset, FPS, or duration. Loads the template, modifies output config, and returns the updated template (use save_template to persist).',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().describe('Project ID'),
      outputType: z.enum(['image', 'video', 'audio']).optional().describe('Change format type'),
      width: z.number().int().min(1).optional().describe('Custom width in pixels'),
      height: z.number().int().min(1).optional().describe('Custom height in pixels'),
      aspectRatio: z.string().optional().describe('Aspect ratio (e.g. "16:9")'),
      resolution: z.string().optional().describe('Resolution base (sd/hd/fhd/4k)'),
      presetId: z.string().optional().describe('Named preset (overrides width/height)'),
      fps: z.number().int().min(1).max(60).optional().describe('Framerate (video only)'),
      format: z.string().optional().describe('Output format (png/mp4/webm/gif)'),
      duration: z.number().optional().describe('Video duration in seconds'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_SET_TEMPLATE_OUTPUT',
        templateId: args.templateId,
        projectId: args.projectId,
        outputType: args.outputType,
        width: args.width,
        height: args.height,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        presetId: args.presetId,
        fps: args.fps,
        format: args.format,
        duration: args.duration,
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── list_presets ── */
  server.tool(
    'list_presets',
    'List all available output presets with dimensions and aspect ratios.',
    {},
    async () => {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, presets: OUTPUT_PRESETS }, null, 2) }],
      };
    }
  );

  /* ── add_template_layer ── */
  server.tool(
    'add_template_layer',
    'Add a new layer (clip) to a template. Supports text, image, shape, video, audio, caption, SVG, and HTML layers. Use save_template to persist.',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().describe('Project ID'),
      layerType: z.enum(['text', 'image', 'shape', 'video', 'audio', 'caption', 'svg', 'html']).describe('Type of layer to add'),
      properties: z.record(z.string(), z.any()).describe('Layer properties (text, src, fontFamily, fontSize, color, fill, shape, html, css, animation, etc.)'),
      start: z.number().optional().describe('Start time in seconds (default 0)'),
      length: z.number().optional().describe('Duration in seconds (default: match timeline)'),
      position: z.string().optional().describe('Position anchor (center, topLeft, top, etc.)'),
      offset: z.object({ x: z.number(), y: z.number() }).optional().describe('Offset from position'),
      trackIndex: z.number().int().optional().describe('Track index (default: new track at front)'),
      alias: z.string().optional().describe('Merge field name (creates {{ ALIAS }} placeholder)'),
      width: z.number().optional().describe('Clip width in pixels'),
      height: z.number().optional().describe('Clip height in pixels'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_ADD_LAYER',
        templateId: args.templateId,
        projectId: args.projectId,
        layer: {
          layerType: args.layerType,
          properties: args.properties,
          start: args.start,
          length: args.length,
          position: args.position,
          offset: args.offset,
          trackIndex: args.trackIndex,
          alias: args.alias,
          width: args.width,
          height: args.height,
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── edit_template_layer ── */
  server.tool(
    'edit_template_layer',
    'Edit an existing layer\'s properties by alias or track/clip index. Merges provided properties with existing ones. Supports: text (text, fontFamily, fontSize, fontWeight, color, align, padding, lineHeight, textTransform, letterSpacing, wordSpacing, background, backgroundPadding, animation), media (src, volume, trim, speed), shape (fill, stroke, cornerRadius, radius), html (html, css), and common (fit, opacity, transition, effect, scale, filter, transform, width, height).',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().describe('Project ID'),
      alias: z.string().optional().describe('Layer alias (merge field name) to identify the layer'),
      trackIndex: z.number().int().optional().describe('Track index (alternative to alias)'),
      clipIndex: z.number().int().optional().describe('Clip index within the track'),
      properties: z.record(z.string(), z.any()).optional().describe('Asset properties to update. Text: text, fontFamily, fontSize, fontWeight, color, align, padding ({left,right,top,bottom}), lineHeight, textTransform (uppercase/lowercase/capitalize), letterSpacing, wordSpacing, background, backgroundPadding, animation ({preset,duration}). Media: src, volume, trim, speed. Shape: fill, stroke, cornerRadius, radius. HTML: html, css. Common: fit, opacity, transition ({in,out}), effect, scale, filter (blur/greyscale/sepia/etc), transform ({rotate,flip,skew}), width, height.'),
      start: z.number().optional().describe('New start time in seconds'),
      length: z.number().optional().describe('New duration in seconds'),
      position: z.string().optional().describe('New position anchor (center, topLeft, top, bottom, left, right, topRight, bottomLeft, bottomRight)'),
      offset: z.object({ x: z.number(), y: z.number() }).optional().describe('New offset from position (normalized -1 to 1 or pixels)'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_EDIT_LAYER',
        templateId: args.templateId,
        projectId: args.projectId,
        identifier: { alias: args.alias, trackIndex: args.trackIndex, clipIndex: args.clipIndex },
        updates: {
          properties: args.properties,
          start: args.start,
          length: args.length,
          position: args.position,
          offset: args.offset,
        },
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── delete_template_layer ── */
  server.tool(
    'delete_template_layer',
    'Remove a layer from a template by alias or track/clip index.',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().describe('Project ID'),
      alias: z.string().optional().describe('Layer alias to delete'),
      trackIndex: z.number().int().optional().describe('Track index (alternative to alias)'),
      clipIndex: z.number().int().optional().describe('Clip index within the track'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_DELETE_LAYER',
        templateId: args.templateId,
        projectId: args.projectId,
        identifier: { alias: args.alias, trackIndex: args.trackIndex, clipIndex: args.clipIndex },
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── list_template_layers ── */
  server.tool(
    'list_template_layers',
    'List all layers (clips) in a template with their types, aliases, timing, and key properties.',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().optional().describe('Project ID'),
    },
    async ({ templateId, projectId }) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_LIST_LAYERS',
        templateId,
        projectId: projectId || '',
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── move_template_layer ── */
  server.tool(
    'move_template_layer',
    'Move a layer (track) to a different position in the z-order. Track 0 is the front (topmost), higher indices are further back. This changes the visual stacking order of layers.',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().describe('Project ID'),
      alias: z.string().optional().describe('Layer alias to move'),
      trackIndex: z.number().int().optional().describe('Track index of the layer to move (alternative to alias)'),
      clipIndex: z.number().int().optional().describe('Clip index within the track'),
      toTrackIndex: z.number().int().describe('Target track index to move to (0 = front/top)'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_MOVE_LAYER',
        templateId: args.templateId,
        projectId: args.projectId,
        identifier: { alias: args.alias, trackIndex: args.trackIndex, clipIndex: args.clipIndex },
        toTrackIndex: args.toTrackIndex,
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── save_template ── */
  server.tool(
    'save_template',
    'Save a template to the project folder (uploads/{projectId}/templates/{id}.json). Use after making changes with set_template_output, add/edit/delete_template_layer.',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().describe('Project ID'),
      templateJson: z.record(z.string(), z.any()).optional().describe('Full template JSON to save (if omitted, saves the in-memory modified template)'),
      overwrite: z.boolean().optional().describe('Overwrite existing template (default true)'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_SAVE_TEMPLATE',
        templateId: args.templateId,
        projectId: args.projectId,
        templateJson: args.templateJson,
        overwrite: args.overwrite !== false,
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── duplicate_template ── */
  server.tool(
    'duplicate_template',
    'Duplicate (copy) a template into the same project or a different project. Copies the template JSON and, when crossing projects, replicates referenced uploads/ media assets. The new template gets a "-copy" suffix by default.',
    {
      templateId: z.string().describe('Source template ID to duplicate'),
      sourceProjectId: z.string().describe('Project ID where the source template lives'),
      destProjectId: z.string().describe('Destination project ID (can be the same as sourceProjectId for a same-project copy)'),
      newTemplateId: z.string().optional().describe('New template ID (default: {templateId}-copy)'),
      newName: z.string().optional().describe('New display name (default: "{original name} (copy)")'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_DUPLICATE_TEMPLATE',
        templateId: args.templateId,
        sourceProjectId: args.sourceProjectId,
        destProjectId: args.destProjectId,
        newTemplateId: args.newTemplateId || '',
        newName: args.newName || '',
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── set_merge_fields ── */
  server.tool(
    'set_merge_fields',
    'Set, update, or delete merge field values in a template. Merge fields are {{ FIELD_NAME }} placeholders used in text/media layers. Use this to change default text, URLs, colors, etc. without editing layers directly.',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().describe('Project ID'),
      fields: z.record(z.string(), z.string()).describe('Map of field names to new values. e.g. { "AD_APPLE_NOTES_TEXT_1": "New body text", "backgroundColor": "#ff0000" }'),
      deleteFields: z.array(z.string()).optional().describe('List of field names to remove from the template'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_SET_MERGE_FIELDS',
        templateId: args.templateId,
        projectId: args.projectId,
        fields: args.fields,
        deleteFields: args.deleteFields,
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── list_merge_fields ── */
  server.tool(
    'list_merge_fields',
    'List all merge fields in a template with their current default values. Shows both user-defined fields (e.g. text content, colors) and system fields (__CFS_* metadata). Merge fields are {{ FIELD_NAME }} placeholders that get replaced during rendering.',
    {
      templateId: z.string().describe('Template ID'),
      projectId: z.string().optional().describe('Project ID'),
    },
    async ({ templateId, projectId }) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_LIST_MERGE_FIELDS',
        templateId,
        projectId: projectId || '',
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── render_local ── */
  server.tool(
    'render_local',
    'Render a template locally using the built-in PixiJS + FFmpeg WASM pipeline (same as the Export button). Returns the file path of the rendered output. Images export as PNG, videos as MP4 (WebM → FFmpeg → MP4).',
    {
      templateId: z.string().describe('Template ID to render'),
      projectId: z.string().optional().describe('Project ID (for project templates and output path)'),
      outputType: z.enum(['image', 'video', 'audio']).optional().describe('Override template\'s default output type'),
      inputMap: z.record(z.string(), z.any()).optional().describe('Merge field values to apply before rendering'),
      filename: z.string().optional().describe('Output filename (auto-generated if omitted)'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_RENDER_LOCAL',
        templateId: args.templateId,
        projectId: args.projectId || '',
        outputType: args.outputType,
        inputMap: args.inputMap,
        filename: args.filename,
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── render_shotstack ── */
  server.tool(
    'render_shotstack',
    'Render a template via the ShotStack cloud API. Supports staging (watermarked, free) and production environments. Polls until completion and returns the CDN URL. Use renderStrategy to control fallback behavior: "shotstack" (cloud only), "credit-gate" (check credits, fallback to local), "shotstack-first" (cloud then local), "local-first" (local then cloud), "local" (browser only).',
    {
      templateId: z.string().describe('Template ID to render'),
      projectId: z.string().optional().describe('Project ID'),
      environment: z.enum(['stage', 'v1']).describe('ShotStack environment: "stage" (watermarked) or "v1" (production)'),
      outputFormat: z.enum(['mp4', 'gif', 'mp3', 'wav']).optional().describe('Output format (default mp4)'),
      inputMap: z.record(z.string(), z.any()).optional().describe('Merge field values'),
      renderStrategy: z.enum(['shotstack', 'local', 'shotstack-first', 'local-first', 'credit-gate']).optional().describe('Render strategy (default "shotstack"). "credit-gate" checks credits first, falls back to local if insufficient.'),
      timeoutMs: z.number().int().optional().describe('Max wait in ms (default 300000 = 5 minutes)'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_RENDER_SHOTSTACK',
        templateId: args.templateId,
        projectId: args.projectId || '',
        environment: args.environment,
        outputFormat: args.outputFormat || 'mp4',
        inputMap: args.inputMap,
        renderStrategy: args.renderStrategy || 'shotstack',
        timeoutMs: args.timeoutMs || 300000,
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── list_shotstack_renders ── */
  server.tool(
    'list_shotstack_renders',
    'List past ShotStack renders stored in your account. Returns render history with URLs, formats, and environments. Requires backend login.',
    {
      limit: z.number().int().optional().describe('Max results (default 20)'),
      environment: z.enum(['stage', 'v1']).optional().describe('Filter by environment'),
    },
    async ({ limit, environment }) => {
      const payload = { type: 'GET_SHOTSTACK_RENDERS' };
      if (limit != null) payload.limit = limit;
      if (environment) payload.environment = environment;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── open_generator_page ── */
  server.tool(
    'open_generator_page',
    'Open the Generator page in the browser, optionally pre-selecting a template and switching the FORMAT TYPE. Must be called before export_generator. This opens the full Generator UI — use it when you want to render via the browser\'s built-in PixiJS pipeline.',
    {
      templateId: z.string().optional().describe('Template to pre-select (e.g. "ad-apple-notes")'),
      projectId: z.string().optional().describe('Project context'),
      outputType: z.enum(['image', 'video', 'audio']).optional().describe('Switch FORMAT TYPE to this (e.g. "video" to enable Export Video)'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_OPEN_GENERATOR',
        templateId: args.templateId,
        projectId: args.projectId || '',
        outputType: args.outputType,
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  /* ── export_generator ── */
  server.tool(
    'export_generator',
    'Trigger the Export button on the currently-open Generator page. The Generator must already be open (via open_generator_page) with a template loaded and the FORMAT TYPE set. Downloads the rendered file (Export PNG, Export Video, or Download Audio depending on format type).',
    {
      outputType: z.enum(['image', 'video', 'audio']).optional().describe('Which export to trigger (default "video"). Must match the FORMAT TYPE.'),
    },
    async (args) => {
      const res = await ctx.sendMessage({
        type: 'CFS_MCP_EXPORT_GENERATOR',
        outputType: args.outputType || 'video',
      });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}

/* Export helpers for use in service worker handlers */
export {
  buildBlankTemplate,
  buildClipFromLayer,
  findClip,
  summariseClip,
  resolveDimensions,
  OUTPUT_PRESETS,
};
