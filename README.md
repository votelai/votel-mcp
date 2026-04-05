# votel-mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants manage and publish websites via [Votel](https://votel.ai).

## Connect Your AI Client

There are two ways to connect — pick the one that fits your client:

| Method | How it works | Best for |
|--------|-------------|----------|
| **Remote (OAuth)** | Connect via URL. No install needed. | Claude.ai, ChatGPT, VS Code |
| **Local (API Key)** | Run on your machine with `npx`. Needs Node.js 18+. | Claude Code, Claude Desktop, Cursor, Windsurf, Cline |

### Remote Setup (OAuth)

No API key or Node.js required. Add the server URL and authorize with your Votel account.

**Claude.ai** (Pro/Max/Team/Enterprise) — Settings > Integrations > MCP Servers > Add Server:

```
https://app.votel.ai/mcp
```

**ChatGPT** (Pro/Plus/Business/Enterprise) — Settings > MCP Servers > Add:

```
https://app.votel.ai/mcp
```

**VS Code** — Command Palette > "MCP: Add Server" > HTTP:

```
https://app.votel.ai/mcp
```

Your client handles the OAuth login flow automatically.

### Local Setup (API Key)

Get your API key from **Settings > API Keys** in your [Votel dashboard](https://app.votel.ai/settings/api-keys).

#### Claude Code

```bash
claude mcp add votel-mcp \
  -e VOTEL_API_KEY=sk_your_api_key_here \
  -- npx -y votel-mcp@latest
```

#### Claude Desktop / Cursor / Windsurf / Cline

Add to your MCP config file:

```json
{
  "mcpServers": {
    "votel-mcp": {
      "command": "npx",
      "args": ["-y", "votel-mcp@latest"],
      "env": {
        "VOTEL_API_KEY": "sk_your_api_key_here"
      }
    }
  }
}
```

**Config file locations:**
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Windows): `%APPDATA%\Claude\claude_desktop_config.json`
- Cursor: `.cursor/mcp.json` in your project root
- Windsurf: MCP Servers section in Windsurf settings
- VS Code: `.vscode/mcp.json` in your project root
- Cline: MCP server settings in the Cline extension

### Client Compatibility

| Client | Local (API Key) | Remote (OAuth) |
|--------|:-:|:-:|
| Claude.ai | — | Yes |
| ChatGPT | — | Yes |
| Claude Code | Yes | Yes |
| Claude Desktop | Yes | Yes (Pro+) |
| Cursor | Yes | Yes |
| Windsurf | Yes | Yes |
| VS Code | Yes | Yes |
| Cline | Yes | Yes |

## Available Tools

| Tool | Description |
|------|-------------|
| `list_websites` | List all websites for your account |
| `create_website` | Create a new website (provisions CDN + storage) |
| `get_website` | Get website details, domains, and configuration |
| `delete_website` | Delete a website and all its resources |
| `add_domain` | Add a custom domain with DNS instructions |
| `remove_domain` | Remove a custom domain |
| `verify_domain` | Check DNS propagation and SSL status |
| `purge_cache` | Purge CDN cache (full or specific URLs) |
| `get_analytics` | Get traffic stats, bandwidth, and cache ratio |
| `get_storage_credentials` | Get storage credentials for direct file uploads |

## Example Prompts

**Managing sites:**
- *"What websites do I have?"*
- *"Create a website called Anderson Legal Group"*
- *"Add the domain example.com to Anderson Legal Group and show me the DNS records I need to set up"*
- *"Purge the cache for Anderson Legal Group"*
- *"How much traffic has Anderson Legal Group gotten this month?"*
- *"Delete the website called Old Test Site"*

**Design & publish (one-shot):**
- *"Design a professional website for a law firm called Harper & Associates and publish it to example.com"*
- *"Build a sleek dark-themed landing page for a SaaS product called Launchpad and put it live on example.com"*
- *"Create a clean website for a dentist office called Bright Smile Dental and publish it to example.com"*
- *"Make a modern site for a real estate agent named Sarah Chen and deploy it to example.com"*
- *"Design a restaurant website for an Italian place called Nonna's Kitchen with their menu and hours, then publish it to example.com"*

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VOTEL_API_KEY` | Yes (local only) | — | Your Votel API key (`sk_...`) |
| `VOTEL_API_URL` | No | `https://app.votel.ai` | Backend URL |

## Documentation

Full setup guide with screenshots: [docs.votel.ai/ai-websites/mcp-setup](https://docs.votel.ai/ai-websites/mcp-setup)

## License

MIT
