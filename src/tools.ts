/**
 * MCP tool definitions for Votel website management.
 * Each tool maps to an endpoint on the Votel backend API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "./api-client.js";

export function registerTools(server: McpServer, api: ApiClient): void {
  // ─── List Websites ──────────────────────────────────────────────
  server.tool(
    "list_websites",
    "List all websites for your account. Returns name, CDN hostname, status, and domain count for each site.",
    {
      search: z
        .string()
        .optional()
        .describe("Optional search query to filter by name"),
      status: z
        .string()
        .optional()
        .describe(
          "Optional status filter: active, provisioning, error, suspended"
        ),
    },
    async ({ search, status }) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const qs = params.toString();
      const path = `/api/websites${qs ? `?${qs}` : ""}`;

      const data = await api.get<{
        websites: Array<{
          id: string;
          name: string;
          cdn_hostname: string | null;
          status: string;
          custom_hostnames: Array<{ hostname: string }>;
          storage_region: string;
        }>;
        total: number;
      }>(path);

      if (data.websites.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No websites found. Use create_website to create one.",
            },
          ],
        };
      }

      const summary = data.websites
        .map(
          (w) =>
            `- ${w.name} (${w.status}) — ${w.cdn_hostname || "no hostname"} [${w.custom_hostnames.length} custom domain(s), region: ${w.storage_region}] id: ${w.id}`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${data.total} website(s):\n\n${summary}`,
          },
        ],
      };
    }
  );

  // ─── Create Website ─────────────────────────────────────────────
  server.tool(
    "create_website",
    "Create a new website. Provisions a CDN-hosted storage zone and pull zone.",
    {
      name: z.string().describe("Display name for the website"),
      storage_region: z
        .string()
        .optional()
        .default("NY")
        .describe(
          "Storage region: NY, LA, UK, DE, SG, SYD, BR, JH, SE. Default: NY"
        ),
    },
    async ({ name, storage_region }) => {
      const data = await api.post<{
        id: string;
        name: string;
        cdn_hostname: string | null;
        storage_password: string | null;
        status: string;
      }>("/api/websites", { name, storage_region });

      return {
        content: [
          {
            type: "text" as const,
            text: `Website "${data.name}" created successfully!\n\nCDN hostname: ${data.cdn_hostname}\nStatus: ${data.status}\nID: ${data.id}\n\nYour site is now live at https://${data.cdn_hostname}`,
          },
        ],
      };
    }
  );

  // ─── Get Website ────────────────────────────────────────────────
  server.tool(
    "get_website",
    "Get detailed information about a specific website including domains, status, and CDN configuration.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
    },
    async ({ site_id }) => {
      const data = await api.get<{
        id: string;
        name: string;
        cdn_hostname: string | null;
        storage_zone_name: string | null;
        storage_region: string;
        custom_hostnames: Array<{
          hostname: string;
          ssl_status: string;
        }>;
        edge_rules_count: number;
        status: string;
        created_at: string;
      }>(`/api/websites/${site_id}`);

      const domains =
        data.custom_hostnames.length > 0
          ? data.custom_hostnames
              .map((d) => `  - ${d.hostname} (SSL: ${d.ssl_status})`)
              .join("\n")
          : "  None";

      return {
        content: [
          {
            type: "text" as const,
            text: `Website: ${data.name}\nStatus: ${data.status}\nCDN hostname: ${data.cdn_hostname}\nStorage zone: ${data.storage_zone_name}\nRegion: ${data.storage_region}\nEdge rules: ${data.edge_rules_count}\nCreated: ${data.created_at}\n\nCustom domains:\n${domains}`,
          },
        ],
      };
    }
  );

  // ─── Delete Website ─────────────────────────────────────────────
  server.tool(
    "delete_website",
    "Permanently delete a website and all its resources (storage, CDN, files). This cannot be undone.",
    {
      site_id: z.string().describe("The website ID (UUID) to delete"),
    },
    async ({ site_id }) => {
      await api.del(`/api/websites/${site_id}`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Website ${site_id} has been deleted. All CDN resources have been cleaned up.`,
          },
        ],
      };
    }
  );

  // ─── Add Domain ─────────────────────────────────────────────────
  server.tool(
    "add_domain",
    "Add a custom domain to a website. Returns DNS instructions for configuring the domain.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      hostname: z
        .string()
        .describe("The custom domain to add (e.g. www.example.com)"),
    },
    async ({ site_id, hostname }) => {
      const data = await api.post<{
        hostname: string;
        ssl_status: string;
        dns_target: string;
        dns_instructions: {
          type: string;
          name: string;
          value: string;
        };
      }>(`/api/websites/${site_id}/domains`, { hostname });

      return {
        content: [
          {
            type: "text" as const,
            text: `Domain "${data.hostname}" added!\n\nDNS Configuration Required:\n  Record type: ${data.dns_instructions.type}\n  Name: ${data.dns_instructions.name}\n  Value: ${data.dns_instructions.value}\n\nSSL status: ${data.ssl_status} (will activate after DNS propagation)\n\nPlease configure this DNS record at your domain registrar. Propagation typically takes 15 minutes to 48 hours.`,
          },
        ],
      };
    }
  );

  // ─── Remove Domain ──────────────────────────────────────────────
  server.tool(
    "remove_domain",
    "Remove a custom domain from a website.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      hostname: z.string().describe("The custom domain to remove"),
    },
    async ({ site_id, hostname }) => {
      await api.del(`/api/websites/${site_id}/domains/${hostname}`);
      return {
        content: [
          {
            type: "text" as const,
            text: `Domain "${hostname}" has been removed from the website.`,
          },
        ],
      };
    }
  );

  // ─── Verify Domain ──────────────────────────────────────────────
  server.tool(
    "verify_domain",
    "Check DNS propagation and SSL certificate status for a custom domain.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      hostname: z.string().describe("The custom domain to verify"),
    },
    async ({ site_id, hostname }) => {
      const data = await api.post<{
        hostname: string;
        ssl_status: string;
        dns_target: string;
      }>(`/api/websites/${site_id}/domains/${hostname}/verify`);

      const isReady =
        data.ssl_status === "verified" || data.ssl_status === "active";

      return {
        content: [
          {
            type: "text" as const,
            text: isReady
              ? `Domain "${data.hostname}" is verified! SSL certificate is active. Your site is accessible at https://${data.hostname}`
              : `Domain "${data.hostname}" SSL status: ${data.ssl_status}. DNS should point to ${data.dns_target}. If you just configured DNS, allow up to 48 hours for propagation.`,
          },
        ],
      };
    }
  );

  // ─── Purge Cache ────────────────────────────────────────────────
  server.tool(
    "purge_cache",
    "Purge the CDN cache for a website. Purge everything or specific URLs.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      urls: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of specific URLs to purge. If omitted, purges the entire cache."
        ),
    },
    async ({ site_id, urls }) => {
      await api.post(`/api/websites/${site_id}/purge`, urls ? { urls } : {});

      return {
        content: [
          {
            type: "text" as const,
            text: urls
              ? `Purged ${urls.length} URL(s) from CDN cache. Changes will propagate within minutes.`
              : `Full CDN cache purge complete. All cached content will be refreshed on next request.`,
          },
        ],
      };
    }
  );

  // ─── Get Analytics ──────────────────────────────────────────────
  server.tool(
    "get_analytics",
    "Get traffic analytics for a website including requests, bandwidth, and cache hit ratio.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      date_from: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      date_to: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ site_id, date_from, date_to }) => {
      const params = new URLSearchParams();
      if (date_from) params.set("date_from", date_from);
      if (date_to) params.set("date_to", date_to);
      const qs = params.toString();
      const path = `/api/websites/${site_id}/analytics${qs ? `?${qs}` : ""}`;

      const data = await api.get<{
        total_requests: number;
        bandwidth_bytes: number;
        cache_hit_ratio: number;
      }>(path);

      const bw =
        data.bandwidth_bytes > 1_073_741_824
          ? `${(data.bandwidth_bytes / 1_073_741_824).toFixed(1)} GB`
          : `${(data.bandwidth_bytes / 1_048_576).toFixed(1)} MB`;

      return {
        content: [
          {
            type: "text" as const,
            text: `Analytics:\n  Total requests: ${data.total_requests.toLocaleString()}\n  Bandwidth used: ${bw}\n  Cache hit ratio: ${data.cache_hit_ratio}%`,
          },
        ],
      };
    }
  );

  // ─── Get Storage Credentials ──────────────────────────────────
  server.tool(
    "get_storage_credentials",
    "Get the storage credentials for a website. These are needed for direct file uploads.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
    },
    async ({ site_id }) => {
      const data = await api.get<{
        storage_zone_name: string;
        storage_password: string;
        storage_region: string;
        cdn_hostname: string;
      }>(`/api/websites/${site_id}/mcp-credentials`);

      return {
        content: [
          {
            type: "text" as const,
            text: `Storage credentials for direct file operations:\n\n  Storage zone: ${data.storage_zone_name}\n  Password: ${data.storage_password}\n  Region: ${data.storage_region}\n  CDN hostname: ${data.cdn_hostname}`,
          },
        ],
      };
    }
  );
}
