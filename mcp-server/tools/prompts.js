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
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are connected to the Extensible Content Chrome extension via MCP.

CAPABILITIES:
• Workflows — Record, edit, and run browser automation workflows with 145+ step types
• Scheduling — One-time and recurring workflow runs with timezone support
• Crypto/DeFi — Direct on-chain operations:
  - Solana: Jupiter swaps, Pump.fun, Raydium (Standard/CPMM/CLMM), Meteora (DLMM/CPAMM)
  - BSC: PancakeSwap, ParaSwap aggregator, BEP-20 transfers
  - Aster: Spot and futures trading via AsterDex
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
• extensible://steps/categories — steps grouped by category
• extensible://wallets — extension wallets (Solana + BSC)
• extensible://following — tracked profiles and wallets
• extensible://following/watch/solana — recent Solana watch activity
• extensible://following/watch/bsc — recent BSC watch activity
• extensible://generators — generator templates with merge fields
• extensible://generators/{id} — full template.json for a generator
• extensible://schedules — scheduled workflow runs
• extensible://run-history — past run results
• extensible://status — extension relay connection status

TOOLS (use these to take action):
• create_workflow, update_workflow, delete_workflow — programmatic workflow CRUD
• run_workflow, set_imported_rows — execute workflows with data
• run_generator — generate images/videos from templates
• schedule_workflow_run, remove_scheduled_runs — manage schedules
• subscribe, unsubscribe, list_subscriptions — real-time data streams (prices, balances, DLMM positions)
• solana_swap, solana_transfer_*, meteora_*, raydium_* — DeFi operations
• bsc_query, bsc_execute — BSC operations
• upload_post, reply_instagram_comment, send_instagram_dm — social media
• mutate_following — manage tracked profiles
• refresh_solana_watch, refresh_bsc_watch — trigger watch polls
• read_storage — inspect any extension state`,
        },
      }],
    })
  );

  /* ── Workflow Builder ── */
  server.prompt(
    'workflow_builder',
    'Learn how workflows are built from steps, with step categories and configuration details.',
    {},
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Help me build or understand a workflow in Extensible Content.

WORKFLOWS consist of ordered steps (actions). Each step has a type (e.g. "click", "solanaJupiterSwap", "llm") with specific configuration.

STEP CATEGORIES:
• interaction — click, hover, scroll, type, select, key, dragDrop, upload, download
• data — extractData, llm, rowMath, rowSetFields, sendToEndpoint, waitForHttpPoll, readJsonFromProject, writeJsonToProject
• flow — loop, runWorkflow, wait, delayBeforeNextRun, goToUrl, openTab
• solana — solanaJupiterSwap, solanaTransferSol/Spl, solanaReadBalances, solanaPumpfunBuy/Sell, solanaPumpOrJupiterBuy/Sell, solanaSellabilityProbe
• raydium — raydiumClmmSwap, raydiumClmmOpenPosition, raydiumCpmmAddLiquidity, raydiumSwapStandard, and 10+ more
• meteora — meteoraDlmmAddLiquidity, meteoraDlmmRemoveLiquidity, meteoraCpammSwap, meteoraCpammAddLiquidity, and more
• bsc — bscPancake, bscQuery, bscAggregatorSwap, bscTransferBnb/Bep20, bscSellabilityProbe
• aster — asterSpotTrade, asterFuturesTrade, asterFuturesAnalysis, asterUserStreamWait
• following — getFollowingProfiles, createFollowingProfile, updateFollowingProfile, selectFollowingAccount
• social — uploadPost, getAnalytics, getPostHistory, getScheduledPosts, sendInstagramDm, replyInstagramComment
• apify — apifyActorRun, apifyRunStart, apifyRunWait, apifyDatasetItems
• media — captureAudio, transcribeAudio, trimVideo, combineVideos, screenCapture, extractAudioFromVideo
• watch — solanaWatchRefresh, solanaWatchReadActivity, bscWatchRefresh, bscWatchReadActivity, watchActivityFilterTxAge, watchActivityFilterPriceDrift
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
To see a workflow's steps: read extensible://workflows/{id}/steps`,
        },
      }],
    })
  );

  /* ── DeFi Portfolio Analysis ── */
  server.prompt(
    'defi_portfolio_analysis',
    'Analyze DeFi wallet balances, open positions, and suggest optimizations.',
    {},
    async () => {
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
}
