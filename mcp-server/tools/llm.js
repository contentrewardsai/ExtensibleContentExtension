/**
 * MCP Tools — LLM provider operations
 */
import { z } from 'zod';

export function registerLlmTools(server, ctx) {
  server.tool(
    'call_llm',
    'Run a single prompt through the configured LLM provider (LaMini, OpenAI, Claude, Gemini, or Grok). Provider and model are determined by Settings unless overridden.',
    {
      prompt: z.string().max(500000).describe('The prompt text (max 500,000 characters)'),
      responseType: z.enum(['text', 'json']).optional().describe('Response format: "text" (default) or "json"'),
      llmProvider: z.enum(['lamini', 'openai', 'claude', 'gemini', 'grok']).optional().describe('Override the workflow default provider'),
      llmOpenaiModel: z.string().max(256).optional().describe('Override OpenAI model id'),
      llmModelOverride: z.string().max(256).optional().describe('Override model id for Claude/Gemini/Grok'),
    },
    async ({ prompt, responseType, llmProvider, llmOpenaiModel, llmModelOverride }) => {
      const payload = { type: 'CALL_LLM', prompt };
      if (responseType) payload.responseType = responseType;
      if (llmProvider) payload.llmProvider = llmProvider;
      if (llmOpenaiModel) payload.llmOpenaiModel = llmOpenaiModel;
      if (llmModelOverride) payload.llmModelOverride = llmModelOverride;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'call_llm_chat',
    'Run a multi-turn chat through the configured cloud LLM provider (not LaMini). Uses the chat provider from Settings.',
    {
      messages: z.array(z.object({
        role: z.enum(['system', 'user', 'assistant']).describe('Message role'),
        content: z.string().describe('Message content'),
      })).min(1).max(128).describe('Chat messages (max 128, total content max 400,000 chars)'),
      options: z.object({
        max_new_tokens: z.number().int().optional(),
        temperature: z.number().min(0).max(2).optional(),
      }).optional().describe('Optional generation parameters'),
    },
    async ({ messages, options }) => {
      const payload = { type: 'CALL_REMOTE_LLM_CHAT', messages };
      if (options) payload.options = options;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );

  server.tool(
    'test_llm_provider',
    'Test an LLM API key with a tiny completion to verify it works.',
    {
      provider: z.enum(['openai', 'claude', 'gemini', 'grok']).describe('Provider to test'),
      token: z.string().max(4096).optional().describe('API key to test (omit to use saved key)'),
    },
    async ({ provider, token }) => {
      const payload = { type: 'CFS_LLM_TEST_PROVIDER', provider };
      if (token) payload.token = token;
      const res = await ctx.sendMessage(payload);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: !res.ok };
    }
  );
}
