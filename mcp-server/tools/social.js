/**
 * MCP Tools — Social media / UploadPost operations
 *
 * All social messages include viaBackend: true so the service worker routes
 * them through the extensiblecontent.com backend proxy. The MCP server does
 * not have access to local API keys (chrome.storage.local).
 */
import { z } from 'zod';

export function registerSocialTools(server, ctx) {
  server.tool(
    'get_facebook_pages',
    'List connected Facebook pages for a profile.',
    { profileId: z.string().optional().describe('Profile ID (uses default if omitted)') },
    async ({ profileId }) => {
      const payload = { type: 'GET_FACEBOOK_PAGES', viaBackend: true };
      if (profileId) payload.profileId = profileId;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_linkedin_pages',
    'List connected LinkedIn pages/organizations for a profile.',
    { profileId: z.string().optional() },
    async ({ profileId }) => {
      const payload = { type: 'GET_LINKEDIN_PAGES', viaBackend: true };
      if (profileId) payload.profileId = profileId;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_pinterest_boards',
    'List Pinterest boards for a profile.',
    { profileId: z.string().optional() },
    async ({ profileId }) => {
      const payload = { type: 'GET_PINTEREST_BOARDS', viaBackend: true };
      if (profileId) payload.profileId = profileId;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_instagram_comments',
    'Get Instagram comments for a post or recent posts.',
    {
      profileId: z.string().optional(),
      mediaId: z.string().optional().describe('Specific media ID to fetch comments for'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ profileId, mediaId, extra }) => {
      const payload = { type: 'GET_INSTAGRAM_COMMENTS', viaBackend: true };
      if (profileId) payload.profileId = profileId;
      if (mediaId) payload.mediaId = mediaId;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'reply_instagram_comment',
    'Reply to an Instagram comment.',
    {
      commentId: z.string().describe('Comment ID to reply to'),
      message: z.string().describe('Reply text'),
      profileId: z.string().optional(),
    },
    async ({ commentId, message, profileId }) => {
      const payload = { type: 'REPLY_INSTAGRAM_COMMENT', viaBackend: true, commentId, message };
      if (profileId) payload.profileId = profileId;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'send_instagram_dm',
    'Send a direct message on Instagram.',
    {
      recipientId: z.string().describe('Instagram user ID or username'),
      message: z.string().describe('DM text'),
      profileId: z.string().optional(),
    },
    async ({ recipientId, message, profileId }) => {
      const payload = { type: 'SEND_INSTAGRAM_DM', viaBackend: true, recipientId, message };
      if (profileId) payload.profileId = profileId;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_analytics',
    'Get social media analytics for a profile.',
    {
      profileId: z.string().optional(),
      platform: z.string().optional().describe('Platform filter (youtube, instagram, tiktok, etc.)'),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ profileId, platform, extra }) => {
      const payload = { type: 'GET_ANALYTICS', viaBackend: true };
      if (profileId) payload.profileId = profileId;
      if (platform) payload.platform = platform;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_post_analytics',
    'Get analytics for a specific post.',
    {
      postId: z.string().describe('Post ID'),
      profileId: z.string().optional(),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ postId, profileId, extra }) => {
      const payload = { type: 'GET_POST_ANALYTICS', viaBackend: true, postId };
      if (profileId) payload.profileId = profileId;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_post_history',
    'Get post history (published posts).',
    {
      profileId: z.string().optional(),
      platform: z.string().optional(),
      limit: z.number().int().optional(),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ profileId, platform, limit, extra }) => {
      const payload = { type: 'GET_POST_HISTORY', viaBackend: true };
      if (profileId) payload.profileId = profileId;
      if (platform) payload.platform = platform;
      if (limit != null) payload.limit = limit;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_scheduled_posts',
    'Get scheduled (upcoming) posts.',
    {
      profileId: z.string().optional(),
      extra: z.record(z.string(), z.any()).optional(),
    },
    async ({ profileId, extra }) => {
      const payload = { type: 'GET_SCHEDULED_POSTS', viaBackend: true };
      if (profileId) payload.profileId = profileId;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'upload_post',
    'Upload a post via UploadPost to one or more social media platforms. IMPORTANT: Platforms enforce daily posting caps (e.g. TikTok=15, YouTube=10, Instagram=50). Use get_posting_limits first to check remaining capacity. On 429 the response includes a "violations" array with cap details. The response JSON body is returned as-is.',
    {
      profileId: z.string().optional(),
      platforms: z.array(z.string()).optional().describe('Target platforms (e.g. ["youtube", "instagram"])'),
      data: z.record(z.string(), z.any()).describe('Post data (title, description, media, schedule, etc.)'),
    },
    async ({ profileId, platforms, data }) => {
      const payload = { type: 'UPLOAD_POST', viaBackend: true, ...data };
      if (profileId) payload.profileId = profileId;
      if (platforms) payload.platforms = platforms;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'cancel_scheduled_post',
    'Cancel a scheduled social media post by its job ID.',
    {
      jobId: z.string().describe('Scheduled post job ID to cancel'),
    },
    async ({ jobId }) => {
      const payload = { type: 'CANCEL_SCHEDULED_POST', viaBackend: true, jobId };
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'list_upload_profiles',
    'List all connected UploadPost profiles with platform connections, JWT status, and metadata.',
    {},
    async () => {
      const res = await ctx.sendMessage({ type: 'GET_UPLOAD_POST_PROFILES' });
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'get_posting_limits',
    'Check daily posting limits and current usage per platform. Returns cap, used count, and remaining posts. Hard caps: Instagram 50, TikTok 15, LinkedIn 150, YouTube 10, Facebook 25, X/Twitter 50, Threads 50, Pinterest 20, Reddit 40, Bluesky 50.',
    {
      user: z.string().describe('Upload Post user identifier'),
      platforms: z.string().optional().describe('Comma-separated platforms to check (default: all)'),
    },
    async ({ user, platforms }) => {
      const payload = { type: 'GET_POSTING_LIMITS', user };
      if (platforms) payload.platforms = platforms;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
