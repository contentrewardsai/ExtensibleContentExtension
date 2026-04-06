/**
 * MCP Tools — Social media / UploadPost operations
 */
import { z } from 'zod';

export function registerSocialTools(server, ctx) {
  server.tool(
    'get_facebook_pages',
    'List connected Facebook pages for a profile.',
    { profileId: z.string().optional().describe('Profile ID (uses default if omitted)') },
    async ({ profileId }) => {
      const payload = { type: 'GET_FACEBOOK_PAGES' };
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
      const payload = { type: 'GET_LINKEDIN_PAGES' };
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
      const payload = { type: 'GET_PINTEREST_BOARDS' };
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
      const payload = { type: 'GET_INSTAGRAM_COMMENTS' };
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
      const payload = { type: 'REPLY_INSTAGRAM_COMMENT', commentId, message };
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
      const payload = { type: 'SEND_INSTAGRAM_DM', recipientId, message };
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
      const payload = { type: 'GET_ANALYTICS' };
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
      const payload = { type: 'GET_POST_ANALYTICS', postId };
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
      const payload = { type: 'GET_POST_HISTORY' };
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
      const payload = { type: 'GET_SCHEDULED_POSTS' };
      if (profileId) payload.profileId = profileId;
      if (extra) Object.assign(payload, extra);
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'upload_post',
    'Upload a post via UploadPost to one or more social media platforms.',
    {
      profileId: z.string().optional(),
      platforms: z.array(z.string()).optional().describe('Target platforms (e.g. ["youtube", "instagram"])'),
      data: z.record(z.string(), z.any()).describe('Post data (title, description, media, schedule, etc.)'),
    },
    async ({ profileId, platforms, data }) => {
      const payload = { type: 'UPLOAD_POST', ...data };
      if (profileId) payload.profileId = profileId;
      if (platforms) payload.platforms = platforms;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
