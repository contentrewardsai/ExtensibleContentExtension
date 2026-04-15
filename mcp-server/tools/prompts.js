/**
 * MCP Prompts — Pre-built prompt templates
 *
 * Prompts appear in the AI client's prompt library (e.g. Claude's prompt picker).
 * They provide high-level context about extension capabilities and guide
 * the AI to use the right resources and tools.
 */

export function registerPrompts(server, ctx) {
  /* ── Extension Capabilities Overview ── */
  server.prompt(
    'extension_capabilities',
    'High-level overview of all Extensible Content features, with pointers to resources for specifics.',
    {},
    async () => {
      const cryptoEnabled = await ctx.cryptoGate.isCryptoEnabled();

      const cryptoCapabilities = cryptoEnabled ? `
• Crypto/DeFi — Direct on-chain operations:
  - Solana: Jupiter swaps, Pump.fun, Raydium (Standard/CPMM/CLMM), Meteora (DLMM/CPAMM)
  - BSC: PancakeSwap, ParaSwap aggregator, BEP-20 transfers
  - Aster: Spot and futures trading via AsterDex` : '';

      const cryptoResources = cryptoEnabled ? `
• extensible://wallets — extension wallets (Solana + BSC)
• extensible://following/watch/solana — recent Solana watch activity
• extensible://following/watch/bsc — recent BSC watch activity` : '';

      const cryptoTools = cryptoEnabled ? `
• subscribe, unsubscribe, list_subscriptions — real-time data streams (prices, balances, DLMM positions)
• solana_swap, solana_transfer_*, meteora_*, raydium_* — DeFi operations
• bsc_query, bsc_execute — BSC operations
• refresh_solana_watch, refresh_bsc_watch — trigger watch polls` : '';

      const cryptoNote = !cryptoEnabled ? `

NOTE: Crypto & Web3 functionality is currently DISABLED in extension settings. Crypto tools, wallet resources, and DeFi operations are unavailable. Enable "Enable Crypto & Web3 Functionality" in Settings → Crypto to use them.` : '';

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `You are connected to the Extensible Content Chrome extension via MCP.

CAPABILITIES:
• Workflows — Record, edit, and run browser automation workflows with 145+ step types
• Scheduling — One-time and recurring workflow runs with timezone support${cryptoCapabilities}
• Following/Pulse — Track wallet activity on Solana and BSC, with automated copy-trading workflows
• Social Media — Post to YouTube, Instagram, Facebook, LinkedIn, Pinterest; analytics; DMs; comment replies
• LLM — Call OpenAI, Claude, Gemini, Grok, or local LaMini from within workflows
• Apify — Run web scraping actors and process datasets
• Media — Video trimming, audio capture, transcription (Whisper)

RESOURCES (browse these for specifics):
• extensible://workflows — list all workflows
• extensible://workflows/{id} — full workflow with all steps
• extensible://workflows/{id}/steps — steps with their type definitions
• extensible://steps — all 145 step type definitions (id, label, category, description)
• extensible://steps/{id} — full step.json with defaultAction, formSchema, and README documentation
• extensible://steps/{id}/readme — step README.md (configuration details, background messages, related steps)
• extensible://steps/categories — steps grouped by category${cryptoResources}
• extensible://following — tracked profiles and wallets
• extensible://generators — generator templates with merge fields
• extensible://generators/{id} — full template.json for a generator
• extensible://schedules — scheduled workflow runs
• extensible://run-history — past run results
• extensible://status — extension relay connection status
• extensible://mcp-endpoints — external MCP servers connected to this one (with status, tools)
• extensible://mcp-endpoints/{id} — detailed view of a specific external endpoint (tools + schemas)
• extensible://mcp-topology — full network topology: this server + all external nodes + tool counts

TOOLS (use these to take action):
• create_workflow, update_workflow, delete_workflow — programmatic workflow CRUD
• run_workflow, set_imported_rows — execute workflows with data
• run_generator — generate images/videos from templates
• schedule_workflow_run, remove_scheduled_runs — manage schedules${cryptoTools}
• upload_post, reply_instagram_comment, send_instagram_dm — social media
• mutate_following — manage tracked profiles
• read_storage — inspect any extension state
• list_external_mcp_endpoints, list_external_mcp_tools, call_external_mcp_tool — chain to external MCP servers${cryptoNote}`,
          },
        }],
      };
    }
  );

  /* ── Workflow Builder ── */
  server.prompt(
    'workflow_builder',
    'Learn how workflows are built from steps, with step categories and configuration details.',
    {},
    async () => {
      const cryptoEnabled = await ctx.cryptoGate.isCryptoEnabled();

      const cryptoStepCategories = cryptoEnabled ? `
• solana — solanaJupiterSwap, solanaTransferSol/Spl, solanaReadBalances, solanaPumpfunBuy/Sell, solanaPumpOrJupiterBuy/Sell, solanaSellabilityProbe
• raydium — raydiumClmmSwap, raydiumClmmOpenPosition, raydiumCpmmAddLiquidity, raydiumSwapStandard, and 10+ more
• meteora — meteoraDlmmAddLiquidity, meteoraDlmmRemoveLiquidity, meteoraCpammSwap, meteoraCpammAddLiquidity, and more
• bsc — bscPancake, bscQuery, bscAggregatorSwap, bscTransferBnb/Bep20, bscSellabilityProbe
• aster — asterSpotTrade, asterFuturesTrade, asterFuturesAnalysis, asterUserStreamWait
• watch — solanaWatchRefresh, solanaWatchReadActivity, bscWatchRefresh, bscWatchReadActivity, watchActivityFilterTxAge, watchActivityFilterPriceDrift` : '';

      const cryptoNote = !cryptoEnabled ? `

NOTE: Crypto & Web3 step types are currently hidden because the feature is disabled in Settings → Crypto.` : '';

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me build or understand a workflow in Extensible Content.

WORKFLOWS consist of ordered steps (actions). Each step has a type (e.g. "click", "solanaJupiterSwap", "llm") with specific configuration.

STEP CATEGORIES:
• interaction — click, hover, scroll, type, select, key, dragDrop, upload, download
• data — extractData, llm, rowMath, rowSetFields, sendToEndpoint, waitForHttpPoll, readJsonFromProject, writeJsonToProject
• flow — loop, runWorkflow, wait, delayBeforeNextRun, goToUrl, openTab${cryptoStepCategories}
• following — getFollowingProfiles, createFollowingProfile, updateFollowingProfile, selectFollowingAccount
• social — uploadPost, getAnalytics, getPostHistory, getScheduledPosts, sendInstagramDm, replyInstagramComment
• apify — apifyActorRun, apifyRunStart, apifyRunWait, apifyDatasetItems
• media — captureAudio, transcribeAudio, trimVideo, combineVideos, screenCapture, extractAudioFromVideo
• generator — runGenerator, renderShotstack

KEY CONCEPTS:
• Steps use {{variables}} from row data for dynamic values
• runIf — conditional execution based on a variable
• loop — iterate over a list variable
• runWorkflow — nest workflows as sub-workflows
• rowMath — arithmetic on row variables (comparisons, min/max, percent change)
• rowSetFields — set new row variables from templates
• meteoraDlmmRangeWatch — poll until DLMM price exits position range (for reactive rebalancing)

CREATING WORKFLOWS PROGRAMMATICALLY:
• Use create_workflow tool with a name and array of step actions
• Browse extensible://steps/{stepId} to see defaultAction and formSchema
• Use update_workflow to modify, delete_workflow to remove

To see all steps: read extensible://steps
To see a specific step's configuration: read extensible://steps/{stepId}
To see a step's detailed docs (background messages, payload, related steps): read extensible://steps/{stepId}/readme
To see existing workflows: read extensible://workflows
To see a workflow's steps: read extensible://workflows/{id}/steps${cryptoNote}`,
          },
        }],
      };
    }
  );

  /* ── DeFi Portfolio Analysis ── */
  server.prompt(
    'defi_portfolio_analysis',
    'Analyze DeFi wallet balances, open positions, and suggest optimizations.',
    {},
    async () => {
      /* Gate entirely when crypto is disabled */
      const cryptoEnabled = await ctx.cryptoGate.isCryptoEnabled();
      if (!cryptoEnabled) {
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: 'Crypto & Web3 functionality is currently disabled in extension settings. Enable "Enable Crypto & Web3 Functionality" in Settings → Crypto to use DeFi portfolio analysis.',
            },
          }],
        };
      }

      let walletInfo = '';
      try {
        const res = await ctx.readStorage(['cfsWallets']);
        const wallets = (res?.data?.cfsWallets || []).map(w => ({
          label: w.label, chain: w.chain, address: w.address,
        }));
        walletInfo = JSON.stringify(wallets, null, 2);
      } catch (_) {
        walletInfo = '(Could not load wallets — relay may not be connected)';
      }
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze my DeFi portfolio across these wallets:

${walletInfo}

Please:
1. Use solana_rpc_read to check SOL and token balances for Solana wallets
2. Use bsc_query to check BNB and token balances for BSC wallets
3. Check for open Raydium CLMM/CPMM positions
4. Check for open Meteora DLMM/CPAMM positions
5. Summarize total holdings by chain and token
6. Identify any positions that may need attention (out-of-range LP, low balances)
7. Suggest rebalancing or yield optimization opportunities`,
          },
        }],
      };
    }
  );

  /* ── Content Generation ── */
  server.prompt(
    'content_generation',
    'Generate images and videos from templates using the generator system and ShotStack rendering.',
    {},
    async () => {
      let templateInfo = '';
      try {
        const res = await ctx.fetchExtensionFile('generator/templates/manifest.json');
        if (res && res.ok && res.data) {
          const manifest = JSON.parse(res.data);
          templateInfo = (manifest.templates || []).join(', ');
        }
      } catch (_) {
        templateInfo = '(could not load template list)';
      }
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me generate content (images and/or videos) using the extension's generator system.

GENERATOR ARCHITECTURE:
• Templates define visual layouts with merge fields (variables like {{headline}}, {{body}}, {{profileImage}})
• Templates are in ShotStack Edit API format with timeline, tracks, clips, and output settings
• Each template has merge fields that map inputs to visual elements
• Output types: image, video, audio, text

AVAILABLE TEMPLATES: ${templateInfo}

HOW TO GENERATE CONTENT:

1. **Browse templates**: Read extensible://generators to see all templates with their merge fields
2. **View a specific template**: Read extensible://generators/{templateId} for full details
3. **Generate directly**: Use the run_generator tool with a templateId and inputMap
4. **Batch generate**: Create a workflow with a runGenerator step + row data for bulk content
5. **Render video**: Use renderShotstack step to render via ShotStack cloud API (staging or production)

WORKFLOW FOR BULK GENERATION:
[runGenerator] → generates image/video per row
[renderShotstack] → optional: cloud render for video output
[uploadPost] → optional: publish to social media

Each row in the data can have different values for merge fields, producing unique content per row.

What would you like to create?`,
          },
        }],
      };
    }
  );

  /* ── Social Media Manager ── */
  server.prompt(
    'social_media_manager',
    'Overview of social media features: posting, analytics, comments, and DMs.',
    {},
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Help me manage social media through the extension.

SOCIAL FEATURES:
• Upload posts to YouTube, Instagram, Facebook, LinkedIn, Pinterest (via UploadPost API)
• Get analytics for profiles and individual posts
• Read and reply to Instagram comments
• Send Instagram DMs
• Get scheduled (upcoming) posts
• Get post history across platforms

TOOLS:
• upload_post — publish content to one or more platforms
• get_analytics — profile-level analytics
• get_post_analytics — per-post metrics
• get_post_history — past published posts
• get_scheduled_posts — upcoming scheduled posts
• get_instagram_comments / reply_instagram_comment — engagement
• send_instagram_dm — direct messaging
• get_facebook_pages / get_linkedin_pages / get_pinterest_boards — connected accounts

What would you like to do?`,
        },
      }],
    })
  );

  /* ── MCP Network Topology ── */
  server.prompt(
    'mcp_network_topology',
    'Understand the MCP server network — external endpoints, chaining, proxying tool calls, and bidirectional communication between MCP servers.',
    {},
    async () => {
      /* Fetch live topology data for context */
      const mcpPort = process.env.EC_MCP_PORT || '3100';
      const mcpToken = process.env._EC_MCP_TOKEN || '';
      let endpointSummary = 'No external endpoints configured.';
      try {
        const resp = await fetch('http://127.0.0.1:' + mcpPort + '/api/mcp-endpoints', {
          headers: { 'Authorization': 'Bearer ' + mcpToken },
          signal: AbortSignal.timeout(5000),
        });
        const data = await resp.json();
        const eps = data?.endpoints || [];
        if (eps.length > 0) {
          endpointSummary = eps.map(ep =>
            `• ${ep.name} (${ep.url}) — ${ep.enabled ? 'enabled' : 'disabled'}, ID: ${ep.id}`
          ).join('\n');
        }
      } catch (_) {}

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `You are connected to the Extensible Content MCP Server, which supports inter-server MCP chaining.

MCP NETWORK ARCHITECTURE:

┌─────────────────────────────────────────────────┐
│  THIS SERVER (Extensible Content MCP)           │
│  Local: http://127.0.0.1:${mcpPort}/mcp${process.env._EC_MCP_TUNNEL_URL ? '\n│  Remote: ' + process.env._EC_MCP_TUNNEL_URL + '/mcp' : ''}             │
│  90+ tools, 20+ resources, 6 prompts           │
├─────────────────────────────────────────────────┤
│  External Endpoints:                            │
${endpointSummary.split('\n').map(l => '│  ' + l).join('\n')}
└─────────────────────────────────────────────────┘

DISCOVERING THE NETWORK:
• extensible://mcp-endpoints — list all external endpoints with status, server info, and tool lists
• extensible://mcp-endpoints/{id} — detailed view of a specific endpoint (tools + input schemas)
• extensible://mcp-topology — full network topology: this server + all external nodes + tool counts

MANAGING EXTERNAL ENDPOINTS:
The server supports unlimited external MCP endpoints. Each has an ID, URL, auth token, name, and enabled flag.

Tools for management:
• list_external_mcp_endpoints — see all registered endpoints
• list_external_mcp_tools — discover tools on a specific endpoint (by ID)
• call_external_mcp_tool — execute a tool on an external endpoint

REST API for programmatic control:
• POST /api/mcp-endpoints — add: { url, token, name, enabled }
• GET /api/mcp-endpoints — list all
• PATCH /api/mcp-endpoints/:id — update fields
• DELETE /api/mcp-endpoints/:id — remove
• POST /api/mcp-endpoints/:id/test — test MCP handshake
• GET /api/mcp-endpoints/:id/tools — list remote tools
• POST /api/mcp-endpoints/:id/proxy — proxy a tool call: { toolName, arguments }

HOW CHAINING WORKS:
1. OUTBOUND: This server proxies tool calls to external MCP servers.
   Flow: Client → This Server → External MCP Server → result back

2. INBOUND: External servers can connect to this server's /mcp endpoint.
   They see all 90+ tools and 20+ resources.

3. BIDIRECTIONAL: Two servers register each other as external endpoints.
   Server A → Server B and Server B → Server A simultaneously.
   This enables complex multi-hop workflows across server boundaries.

PROTOCOL:
• Uses MCP Streamable HTTP transport (JSON-RPC over HTTP with SSE responses)
• Session management via Mcp-Session-Id header
• Bearer token authentication
• Each endpoint maintains its own MCP session (initialize → initialized → tools/call)

USE CASES:
• Team collaboration: Connect to a teammate's MCP server to access their tools
• Service integration: Connect to third-party AI/data services
• Microservices: Split capabilities across specialized MCP servers
• Cross-chain DeFi: One server for Solana, another for BSC, orchestrated together`,
          },
        }],
      };
    }
  );
}
