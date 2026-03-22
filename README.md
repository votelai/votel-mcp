# votel-mcp

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants manage and publish websites via [Votel](https://votel.ai).

Works with Claude Code, Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Quick Start (Claude Code)

```bash
claude mcp add votel-mcp \
  -e VOTEL_API_KEY=sk_your_api_key_here \
  -- npx -y votel-mcp@latest
```

Get your API key from **Settings > API Keys** in your Votel dashboard.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VOTEL_API_KEY` | Yes | — | Your Votel API key (`sk_...`) |
| `VOTEL_API_URL` | No | `https://app.votel.ai` | Backend URL (change for self-hosted) |

## Claude Desktop / Cursor / Windsurf

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

## Available Tools

| Tool | Description |
|------|-------------|
| `list_websites` | List all websites for your account |
| `create_website` | Create a new website (provisions CDN + storage) |
| `get_website` | Get website details |
| `delete_website` | Delete a website and all resources |
| `add_domain` | Add a custom domain with DNS instructions |
| `remove_domain` | Remove a custom domain |
| `verify_domain` | Check DNS/SSL verification status |
| `purge_cache` | Purge CDN cache (full or specific URLs) |
| `get_analytics` | Get traffic stats, bandwidth, cache ratio |
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

## License

MIT
