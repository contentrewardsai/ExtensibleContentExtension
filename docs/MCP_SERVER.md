# MCP Server

The Extensible Content extension includes a local MCP (Model Context Protocol) server that exposes 87+ tools covering the full extension surface. External AI clients — Claude Desktop, Cursor, VS Code Copilot, or any MCP-compatible agent — can interact with your workflows, schedules, Following profiles, crypto wallets, DeFi protocols, LLM providers, Apify actors, social media accounts, and chain to other MCP servers.

## Architecture

```
┌──────────────────┐     HTTP/SSE      ┌──────────────────┐
│  AI Client       │ ◄──────────────►  │  MCP Server      │
│  (Claude, etc.)  │    port 3100      │  (standalone)    │
└──────────────────┘                   └────────┬─────────┘
                                                │ WebSocket
                                       ┌────────┴─────────┐
                                       │  mcp-relay.html   │
                                       │  (Extension tab)  │
                                       └────────┬─────────┘
                                                │ chrome.runtime
                                       ┌────────┴─────────┐
                                       │  Service Worker   │
                                       │  (Chrome ext.)    │
                                       └──────────────────┘
```

The MCP server is a standalone program that runs on your computer. It communicates with the Chrome extension through `mcp/mcp-relay.html`, which maintains a WebSocket connection and bridges tool calls to the extension's service worker via `chrome.runtime.sendMessage`.

**No Node.js, npm, or command line is needed.** The binary is self-contained.

## Quick Start

### 1. Configure in Settings

1. Open the extension **Settings** page
2. Scroll to **MCP Server**
3. Check **Enable MCP Server**
4. Click **Save MCP settings**

### 2. Download the binary

Click **📂 Find MCP Server binary** in Settings. Platform-specific binaries are in `mcp-server/dist/`:

| Binary | Platform | Typical Size |
|--------|----------|------|
| `StartMacMCPServer` | macOS Apple Silicon (M1/M2/M3/M4) | ~59MB |
| `StartMacIntelMCPServer` | macOS Intel | ~64MB |
| `StartWindowsMCPServer.exe` | Windows x64 | ~31MB (UPX compressed) |
| `StartLinuxMCPServer` | Linux x64 | ~24MB (UPX compressed) |

No Node.js or npm needed — the binaries are self-contained.

### 3. Start the server

Double-click the binary for your OS. It auto-reads your token and port from `ec-mcp-config.json` (written when you save settings).

> **macOS first time:** Right-click the binary → **Open**, then click **Open** in the Gatekeeper dialog.

### 4. Copy your AI client config

In Settings → MCP Server → **Client Config**, copy the JSON and paste it into your AI client's MCP configuration (Claude Desktop, Cursor, VS Code, etc.).

## Configuration

The server reads its configuration in this priority order (later overrides earlier):

1. **`ec-mcp-config.json`** — written automatically by Settings when you save. Placed next to the binary in `mcp-server/`.
2. **Environment variables** — `EC_MCP_TOKEN` and `EC_MCP_PORT`
3. **CLI args** — `--token <token> --port <port>` (for developers)

Example `ec-mcp-config.json`:
```json
{
  "token": "auto-generated-uuid",
  "port": 3100
}
```

## Developer Setup

If you're working on the extension source code and want to run the server from source:

```bash
# One-time: install dependencies
cd mcp-server && npm install

# Start with auto-restart on changes
npm run mcp:dev -- --token YOUR_TOKEN

# Start normally  
npm run mcp:start -- --token YOUR_TOKEN --port 3100

# Environment variables also work
EC_MCP_TOKEN=your-token EC_MCP_PORT=3100 npm run mcp:start
```

## Building Binaries

Requires [Bun](https://bun.sh/) installed on the build machine. Bun cross-compiles all platforms from any host.

```bash
cd mcp-server

# Build all platforms (linux-x64, darwin-arm64, darwin-x64, win-x64)
./build.sh

# Build a single platform
./build.sh darwin-arm64
```

### UPX Compression

The build script automatically compresses binaries with [UPX](https://upx.github.io/) if installed. This is critical for keeping Windows and Linux binaries under 100MB (GitHub's file size limit for git commits).

```bash
# Install UPX (required for compression)
brew install upx        # macOS
sudo apt install upx    # Ubuntu/Debian
```

| Platform | Uncompressed | UPX Compressed | Notes |
|----------|-------------|----------------|-------|
| Linux x64 | ~111MB | **~24MB** | 78% reduction |
| Windows x64 | ~126MB | **~31MB** | 75% reduction |
| macOS ARM | ~59MB | ~59MB | UPX doesn't support macOS Mach-O |
| macOS Intel | ~64MB | ~64MB | UPX doesn't support macOS Mach-O |

> **Important:** Always install UPX before building. Without it, Windows and Linux binaries will exceed 100MB and cannot be committed to git.

The build also bundles `cloudflared` for the host platform and uses `--minify` to reduce the embedded JS bundle size.

## Security

### Bearer Token Authentication
Every MCP request and WebSocket relay connection requires the bearer token. Tokens are auto-generated as UUIDs and stored in `chrome.storage.local`.

### Localhost Only
The server binds exclusively to `127.0.0.1` — no external connections are possible.

### Dry-Run Confirmation
**Enabled by default.** When enabled, any MCP tool that performs a write operation (swap, transfer, trade, LP operation) returns a dry-run preview first. The AI client must call the tool again with `confirm: true` to execute the actual transaction. Toggle this in Settings → MCP Server → Transaction Safety.

> ⚠️ **WARNING:** MCP tools can execute real financial transactions through your extension wallets. Do not use large amounts of funds or funds you are concerned about losing. Always review tool calls in your AI client before approving.

## Available Tools (84)

### Workflows (6)
| Tool | Description |
|------|-------------|
| `list_workflows` | List all workflows with IDs, names, step counts |
| `get_workflow` | Get full workflow definition by ID |
| `run_workflow` | Run a workflow with optional row data |
| `set_imported_rows` | Set sidepanel imported rows |
| `clear_imported_rows` | Clear all imported rows |
| `get_run_history` | Get workflow run history |

### Scheduling (3)
| Tool | Description |
|------|-------------|
| `list_scheduled_runs` | List all scheduled/recurring runs |
| `schedule_workflow_run` | Create one-time or recurring schedule entries |
| `remove_scheduled_runs` | Remove scheduled runs by ID |

### Following / Pulse (9)
| Tool | Description |
|------|-------------|
| `get_following_profiles` | Get all Following profiles and accounts |
| `mutate_following` | Create/update/delete profiles and accounts |
| `get_following_automation_status` | Check automation readiness |
| `get_solana_watch_activity` | Get Solana watch activity |
| `get_bsc_watch_activity` | Get BSC watch activity |
| `refresh_solana_watch` | Force Solana watch poll |
| `refresh_bsc_watch` | Force BSC watch poll |
| `clear_solana_watch_activity` | Clear Solana activity |
| `clear_bsc_watch_activity` | Clear BSC activity |

### Solana Crypto (15)
| Tool | Description |
|------|-------------|
| `solana_rpc_read` | Read balances, token accounts, mint info |
| `solana_rugcheck` | Token safety report |
| `solana_perps_status` | Perpetual futures status |
| `jupiter_perps_markets` | Jupiter perps market data |
| `solana_pump_market_probe` | PumpFun bonding curve check |
| `solana_swap` | Jupiter swap ⚠️ |
| `solana_transfer_sol` | SOL transfer ⚠️ |
| `solana_transfer_spl` | SPL token transfer ⚠️ |
| `solana_ensure_token_account` | Create ATA ⚠️ |
| `solana_wrap_sol` | Wrap SOL ⚠️ |
| `solana_unwrap_sol` | Unwrap wSOL ⚠️ |
| `solana_pumpfun_buy` | PumpFun buy ⚠️ |
| `solana_pumpfun_sell` | PumpFun sell ⚠️ |
| `solana_pump_or_jupiter_buy` | Auto-route buy ⚠️ |
| `solana_pump_or_jupiter_sell` | Auto-route sell ⚠️ |
| `solana_sellability_probe` | Sellability probe ⚠️ |

### BSC (4)
| Tool | Description |
|------|-------------|
| `bsc_query` | Read-only BSC queries |
| `bsc_execute` | BSC transaction ⚠️ |
| `bsc_sellability_probe` | BSC sellability probe ⚠️ |

### Raydium (9)
| Tool | Description |
|------|-------------|
| `raydium_swap_standard` | Standard AMM swap ⚠️ |
| `raydium_add_liquidity` | Standard LP add ⚠️ |
| `raydium_remove_liquidity` | Standard LP remove ⚠️ |
| `raydium_clmm_swap` | CLMM swap ⚠️ |
| `raydium_clmm_open_position` | Open CLMM position ⚠️ |
| `raydium_clmm_close_position` | Close CLMM position ⚠️ |
| `raydium_clmm_collect_rewards` | Collect CLMM rewards ⚠️ |
| `raydium_cpmm_add_liquidity` | CPMM LP add ⚠️ |
| `raydium_cpmm_remove_liquidity` | CPMM LP remove ⚠️ |

### Meteora (7)
| Tool | Description |
|------|-------------|
| `meteora_dlmm_add_liquidity` | DLMM LP add ⚠️ |
| `meteora_dlmm_remove_liquidity` | DLMM LP remove ⚠️ |
| `meteora_dlmm_claim_rewards` | DLMM claim rewards ⚠️ |
| `meteora_cpamm_swap` | CPAMM swap ⚠️ |
| `meteora_cpamm_add_liquidity` | CPAMM LP add ⚠️ |
| `meteora_cpamm_remove_liquidity` | CPAMM LP remove ⚠️ |
| `meteora_cpamm_claim_fees` | CPAMM claim fees ⚠️ |

### Aster DEX (8)
| Tool | Description |
|------|-------------|
| `aster_futures_market` | Futures market data |
| `aster_spot_market` | Spot market data |
| `aster_futures_account` | Futures account info |
| `aster_spot_account` | Spot account info |
| `aster_futures_analysis` | Composite analysis reads |
| `aster_futures_trade` | Futures trading ⚠️ |
| `aster_spot_trade` | Spot trading ⚠️ |
| `aster_user_stream_wait` | WebSocket event wait |

### LLM (3)
| Tool | Description |
|------|-------------|
| `call_llm` | Single prompt completion |
| `call_llm_chat` | Multi-turn chat |
| `test_llm_provider` | Test API key |

### Apify (5)
| Tool | Description |
|------|-------------|
| `apify_run_actor` | Run actor/task (sync or async) |
| `apify_run_start` | Start async run |
| `apify_run_wait` | Wait for run completion |
| `apify_dataset_items` | Fetch dataset items |
| `apify_test_token` | Test API token |

### Social Media (11)
| Tool | Description |
|------|-------------|
| `get_facebook_pages` | List Facebook pages |
| `get_linkedin_pages` | List LinkedIn pages |
| `get_pinterest_boards` | List Pinterest boards |
| `get_instagram_comments` | Get Instagram comments |
| `reply_instagram_comment` | Reply to comment |
| `send_instagram_dm` | Send DM |
| `get_analytics` | Social analytics |
| `get_post_analytics` | Post-level analytics |
| `get_post_history` | Published post history |
| `get_scheduled_posts` | Upcoming posts |
| `upload_post` | Publish to platforms |

### System & MCP Gateway (7)
| Tool | Description |
|------|-------------|
| `get_extension_status` | Relay connection status |
| `get_step_types` | Available step types |
| `read_storage` | Read chrome.storage keys |
| `get_tab_info` | Active tab information |
| `tunnel_status` | Remote access tunnel status |
| `list_external_mcp_endpoints` | List configured external MCP servers |
| `list_external_mcp_tools` | Browse tools on a remote MCP server |
| `call_external_mcp_tool` | Execute a tool on a remote MCP server |

⚠️ = write operation, subject to dry-run confirmation

## Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | No | Health check, relay status, uptime |
| `POST /mcp` | Bearer | MCP Streamable HTTP (tool calls) |
| `GET /mcp` | Bearer | Server-Sent Events for notifications |
| `DELETE /mcp` | Bearer | Session cleanup |
| `WS /ws?token=…` | Query | Extension relay WebSocket |

## Storage Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `cfsMcpEnabled` | boolean | `false` | MCP server enabled |
| `cfsMcpPort` | number | `3100` | Server port |
| `cfsMcpBearerToken` | string | auto-UUID | Bearer token |
| `cfsMcpDryRunConfirmation` | boolean | `true` | Dry-run for writes |

## Troubleshooting

### Server won't start
- Check that port 3100 (or your configured port) is not in use
- Make sure `ec-mcp-config.json` exists next to the binary (click **Save MCP settings** to create it)
- If running from source, ensure `--token` is provided

### Relay won't connect
- Make sure the MCP server is running on the configured port
- Open `mcp/mcp-relay.html` in the extension's browser
- Check Settings → MCP Server → Status indicator

### macOS Gatekeeper blocks the binary
```bash
chmod +x StartMacMCPServer
xattr -d com.apple.quarantine StartMacMCPServer
```

### Tools return "Extension relay not connected"
The relay page (`mcp/mcp-relay.html`) must be open in the extension browser. The WebSocket reconnects automatically if the server restarts.
