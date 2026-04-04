#!/usr/bin/env node
/**
 * Guard: remote LLM module loaded and CALL_LLM / chat wired in the service worker.
 * Run: node scripts/verify-remote-llm-wired.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const modPath = path.join(root, 'background', 'remote-llm.js');

for (const p of [swPath, modPath]) {
  if (!fs.existsSync(p)) {
    console.error('verify-remote-llm-wired: missing', path.relative(root, p));
    process.exit(1);
  }
}

const sw = fs.readFileSync(swPath, 'utf8');
const checks = [
  ["importScripts('remote-llm.js')", "importScripts('remote-llm.js')"],
  ['CALL_REMOTE_LLM_CHAT', "msg.type === 'CALL_REMOTE_LLM_CHAT'"],
  ['cfsLlmWorkflowProvider branch', 'cfsLlmWorkflowProvider'],
  ['CFS_remoteLlm.callRemoteLlmStep', 'CFS_remoteLlm.callRemoteLlmStep'],
  ['cfsSanitizeLlmChatMessages', 'cfsSanitizeLlmChatMessages'],
  ['cfsValidateRemoteChatInput', 'cfsValidateRemoteChatInput'],
  ['CALL_LLM msg llmProvider', 'msgLlmProvider'],
  ['CFS_CALL_LLM_MAX_PROMPT_CHARS', 'CFS_CALL_LLM_MAX_PROMPT_CHARS'],
  ["CFS_LLM_TEST_PROVIDER", "msg.type === 'CFS_LLM_TEST_PROVIDER'"],
  ['CFS_LLM_API_KEY_MAX_CHARS', 'CFS_LLM_API_KEY_MAX_CHARS'],
  ['cfsAssertResolvedLlmModelLength', 'cfsAssertResolvedLlmModelLength'],
];

for (const [label, needle] of checks) {
  if (!sw.includes(needle)) {
    console.error('verify-remote-llm-wired: service-worker.js missing:', label);
    process.exit(1);
  }
}
const idxFr = sw.indexOf("importScripts('fetch-resilient.js')");
const idxRm = sw.indexOf("importScripts('remote-llm.js')");
if (idxFr < 0 || idxRm < 0 || !(idxFr < idxRm)) {
  console.error('verify-remote-llm-wired: service-worker.js must import fetch-resilient.js before remote-llm.js');
  process.exit(1);
}

const rm = fs.readFileSync(modPath, 'utf8');
for (const n of [
  'callRemoteLlmStep',
  'callRemoteChat',
  'pingProvider',
  'resolveModel',
  'mergeAdjacentGeminiContents',
  'cfsLlmFetch',
  'CFS_LLM_MODEL_ID_MAX_CHARS',
  'openAiReasoningStyle',
]) {
  if (!rm.includes(n)) {
    console.error('verify-remote-llm-wired: remote-llm.js missing:', n);
    process.exit(1);
  }
}
const llmFetchIdx = rm.indexOf('async function cfsLlmFetch');
if (llmFetchIdx < 0) {
  console.error('verify-remote-llm-wired: remote-llm.js missing cfsLlmFetch');
  process.exit(1);
}
const llmFetchSlice = rm.slice(llmFetchIdx, llmFetchIdx + 450);
if (!llmFetchSlice.includes('__CFS_fetchWith429Backoff')) {
  console.error('verify-remote-llm-wired: cfsLlmFetch must use __CFS_fetchWith429Backoff when available');
  process.exit(1);
}

const settingsHtmlPath = path.join(root, 'settings', 'settings.html');
if (!fs.existsSync(settingsHtmlPath)) {
  console.error('verify-remote-llm-wired: missing', path.relative(root, settingsHtmlPath));
  process.exit(1);
}
const settingsHtml = fs.readFileSync(settingsHtmlPath, 'utf8');
const settingsNeedles = [
  ['settings LLM section id', 'id="cfsLlmSection"'],
  ['cfsLlmWorkflowProviderSelect', 'id="cfsLlmWorkflowProviderSelect"'],
  ['cfsLlmChatProviderSelect', 'id="cfsLlmChatProviderSelect"'],
  ['workflow OpenAI model row class', 'cfs-llm-workflow-openai-model-row'],
  ['chat OpenAI model row class', 'cfs-llm-chat-openai-model-row'],
  ['saveCfsLlmWorkflowDefaultsBtn', 'id="saveCfsLlmWorkflowDefaultsBtn"'],
  ['saveCfsLlmChatDefaultsBtn', 'id="saveCfsLlmChatDefaultsBtn"'],
];
for (const [label, needle] of settingsNeedles) {
  if (!settingsHtml.includes(needle)) {
    console.error('verify-remote-llm-wired: settings/settings.html missing:', label);
    process.exit(1);
  }
}

console.log('verify-remote-llm-wired: OK');
process.exit(0);
