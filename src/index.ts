#!/usr/bin/env node

/**
 * Votel MCP Server
 *
 * An MCP server that enables AI assistants to manage and publish websites
 * via the Votel platform.
 *
 * Environment variables:
 *   VOTEL_API_KEY  - Your Votel API key (sk_...). Create one at Settings > API Keys.
 *   VOTEL_API_URL  - Backend URL (optional, defaults to https://app.votel.ai)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApiClient } from "./api-client.js";
import { registerTools } from "./tools.js";

const apiKey = process.env.VOTEL_API_KEY;
const apiUrl = process.env.VOTEL_API_URL || "https://app.votel.ai";

if (!apiKey) {
  console.error("Error: VOTEL_API_KEY environment variable is required.");
  console.error(
    "Create an API key at Settings > API Keys in your Votel dashboard."
  );
  process.exit(1);
}

const server = new McpServer({
  name: "votel-mcp",
  version: "1.0.0",
});

const api = new ApiClient(apiUrl, apiKey);

registerTools(server, api);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
