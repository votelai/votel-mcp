/**
 * MCP tool definitions for Votel.
 *
 * Tools are organized by category:
 *   - Websites (10): CDN site management, domains, cache, analytics
 *   - Contacts (5): CRM contact CRUD
 *   - Pipeline (3): Sales pipeline and stage management
 *   - Tasks (4): Task CRUD with priority and status
 *   - Communication (2): SMS sending and activity feed
 *   - Custom Fields (2): CRM field configuration
 *   - Global Variables (1): Tenant-level variables
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "./api-client.js";

export function registerTools(server: McpServer, api: ApiClient): void {
  // ═══════════════════════════════════════════════════════════════════
  // WEBSITES
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    "list_websites",
    "List all websites for your account. Returns name, CDN hostname, status, and domain count for each site. Example: 'List my websites' or 'Show active websites'.",
    {
      search: z.string().optional().describe("Search by website name"),
      status: z.enum(["active", "provisioning", "error", "suspended"]).optional().describe("Filter by website status"),
    },
    async ({ search, status }) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const qs = params.toString();
      const data = await api.get<{ websites: Array<{ id: string; name: string; cdn_hostname: string | null; status: string; custom_hostnames: Array<{ hostname: string }>; storage_region: string }>; total: number }>(`/api/websites${qs ? `?${qs}` : ""}`);
      if (data.websites.length === 0) return { content: [{ type: "text" as const, text: "No websites found. Use create_website to create one." }] };
      const summary = data.websites.map((w) => `- ${w.name} (${w.status}) — ${w.cdn_hostname || "no hostname"} [${w.custom_hostnames.length} domain(s), region: ${w.storage_region}] id: ${w.id}`).join("\n");
      return { content: [{ type: "text" as const, text: `Found ${data.websites.length} website(s):\n\n${summary}` }] };
    }
  );

  server.tool(
    "create_website",
    "Create a new website with CDN hosting. Provisions storage and pull zone automatically. Example: 'Create a website called My Business'.",
    {
      name: z.string().describe("Display name for the website"),
      storage_region: z.enum(["NY", "LA", "UK", "DE", "SG", "SYD", "BR", "JH", "SE"]).optional().default("NY").describe("Storage region. NY=New York, LA=Los Angeles, UK=London, DE=Frankfurt, SG=Singapore, SYD=Sydney, BR=São Paulo, JH=Johannesburg, SE=Stockholm"),
    },
    async ({ name, storage_region }) => {
      const data = await api.post<{ id: string; name: string; cdn_hostname: string | null; status: string }>("/api/websites", { name, storage_region });
      return { content: [{ type: "text" as const, text: `Website "${data.name}" created!\n\nCDN hostname: ${data.cdn_hostname}\nStatus: ${data.status}\nID: ${data.id}\n\nLive at https://${data.cdn_hostname}` }] };
    }
  );

  server.tool(
    "get_website",
    "Get detailed information about a website including domains, CDN config, and status. Example: 'Show me details for website <id>'.",
    { site_id: z.string().describe("The website ID (UUID)") },
    async ({ site_id }) => {
      const data = await api.get<{ id: string; name: string; cdn_hostname: string | null; storage_zone_name: string | null; storage_region: string; custom_hostnames: Array<{ hostname: string; ssl_status: string }>; edge_rules_count: number; status: string; created_at: string }>(`/api/websites/${site_id}`);
      const domains = data.custom_hostnames.length > 0 ? data.custom_hostnames.map((d) => `  - ${d.hostname} (SSL: ${d.ssl_status})`).join("\n") : "  None";
      return { content: [{ type: "text" as const, text: `Website: ${data.name}\nStatus: ${data.status}\nCDN: ${data.cdn_hostname}\nRegion: ${data.storage_region}\nCreated: ${data.created_at}\n\nCustom domains:\n${domains}` }] };
    }
  );

  server.tool(
    "delete_website",
    "Permanently delete a website and all its resources (storage, CDN, files). Cannot be undone. Example: 'Delete the website called Test Site'.",
    { site_id: z.string().describe("The website ID (UUID) to delete") },
    async ({ site_id }) => {
      await api.del(`/api/websites/${site_id}`);
      return { content: [{ type: "text" as const, text: `Website ${site_id} deleted. All CDN resources cleaned up.` }] };
    }
  );

  server.tool(
    "add_domain",
    "Add a custom domain to a website. Returns DNS records you need to configure. Example: 'Add example.com to my website'.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      hostname: z.string().describe("The custom domain (e.g. www.example.com)"),
    },
    async ({ site_id, hostname }) => {
      const data = await api.post<{ hostname: string; ssl_status: string; dns_instructions: { type: string; name: string; value: string } }>(`/api/websites/${site_id}/domains`, { hostname });
      return { content: [{ type: "text" as const, text: `Domain "${data.hostname}" added!\n\nDNS Configuration:\n  Record: ${data.dns_instructions.type}\n  Name: ${data.dns_instructions.name}\n  Value: ${data.dns_instructions.value}\n\nSSL: ${data.ssl_status} (activates after DNS propagation)` }] };
    }
  );

  server.tool(
    "remove_domain",
    "Remove a custom domain from a website. Example: 'Remove example.com from my website'.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      hostname: z.string().describe("The custom domain to remove"),
    },
    async ({ site_id, hostname }) => {
      await api.del(`/api/websites/${site_id}/domains/${hostname}`);
      return { content: [{ type: "text" as const, text: `Domain "${hostname}" removed.` }] };
    }
  );

  server.tool(
    "verify_domain",
    "Check DNS propagation and SSL status for a custom domain. Example: 'Check if example.com is verified'.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      hostname: z.string().describe("The custom domain to verify"),
    },
    async ({ site_id, hostname }) => {
      const data = await api.post<{ hostname: string; ssl_status: string; dns_target: string }>(`/api/websites/${site_id}/domains/${hostname}/verify`);
      const ready = data.ssl_status === "verified" || data.ssl_status === "active";
      return { content: [{ type: "text" as const, text: ready ? `Domain "${data.hostname}" verified! SSL active. Site live at https://${data.hostname}` : `Domain "${data.hostname}" SSL: ${data.ssl_status}. DNS should point to ${data.dns_target}.` }] };
    }
  );

  server.tool(
    "purge_cache",
    "Clear CDN cache for a website. Purge everything or specific URLs. Example: 'Purge cache for my website'.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      urls: z.array(z.string()).optional().describe("Specific URLs to purge. Omit to purge entire cache."),
    },
    async ({ site_id, urls }) => {
      await api.post(`/api/websites/${site_id}/purge`, urls ? { urls } : {});
      return { content: [{ type: "text" as const, text: urls ? `Purged ${urls.length} URL(s) from cache.` : "Full cache purge complete." }] };
    }
  );

  server.tool(
    "get_analytics",
    "Get traffic analytics for a website — requests, bandwidth, and cache hit ratio. Example: 'Show analytics for my website'.",
    {
      site_id: z.string().describe("The website ID (UUID)"),
      date_from: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      date_to: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ site_id, date_from, date_to }) => {
      const params = new URLSearchParams();
      if (date_from) params.set("date_from", date_from);
      if (date_to) params.set("date_to", date_to);
      const qs = params.toString();
      const data = await api.get<{ total_requests: number; bandwidth_bytes: number; cache_hit_ratio: number }>(`/api/websites/${site_id}/analytics${qs ? `?${qs}` : ""}`);
      const bw = data.bandwidth_bytes > 1_073_741_824 ? `${(data.bandwidth_bytes / 1_073_741_824).toFixed(1)} GB` : `${(data.bandwidth_bytes / 1_048_576).toFixed(1)} MB`;
      return { content: [{ type: "text" as const, text: `Analytics:\n  Requests: ${data.total_requests.toLocaleString()}\n  Bandwidth: ${bw}\n  Cache hit ratio: ${data.cache_hit_ratio}%` }] };
    }
  );

  server.tool(
    "get_storage_credentials",
    "Get storage credentials for direct file uploads to a website. Example: 'Get upload credentials for my website'.",
    { site_id: z.string().describe("The website ID (UUID)") },
    async ({ site_id }) => {
      const data = await api.get<{ storage_zone_name: string; storage_password: string; storage_region: string; cdn_hostname: string }>(`/api/websites/${site_id}/mcp-credentials`);
      return { content: [{ type: "text" as const, text: `Storage credentials:\n  Zone: ${data.storage_zone_name}\n  Password: ${data.storage_password}\n  Region: ${data.storage_region}\n  CDN: ${data.cdn_hostname}` }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // FILE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    "list_files",
    "List files and folders in a website's storage. Use path '/' for root directory. Example: 'Show files in my website'.",
    {
      site_id: z.string().describe("The website ID (UUID). Get from list_websites."),
      path: z.string().optional().default("/").describe("Directory path. Use '/' for root. Example: '/images'"),
    },
    async ({ site_id, path }) => {
      const data = await api.get<Array<{ ObjectName: string; IsDirectory: boolean; Length: number }>>(`/api/websites/${site_id}/files?path=${encodeURIComponent(path ?? "/")}`);
      if (!data || data.length === 0) return { content: [{ type: "text" as const, text: "No files found in this directory." }] };
      const lines = data.map((f) => {
        if (f.IsDirectory) return `  [folder] ${f.ObjectName}`;
        const size = f.Length > 1024 ? `${(f.Length / 1024).toFixed(1)} KB` : `${f.Length} bytes`;
        return `  ${f.ObjectName} (${size})`;
      });
      return { content: [{ type: "text" as const, text: `Files in ${path}:\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "upload_file",
    "Upload a file to a website's storage. Content must be base64-encoded. File is immediately available via CDN. Example: 'Upload index.html to my website'.",
    {
      site_id: z.string().describe("The website ID (UUID). Get from list_websites."),
      file_name: z.string().describe("File name. Example: 'index.html', 'style.css'"),
      content: z.string().describe("File content as base64-encoded string"),
      path: z.string().optional().default("/").describe("Directory path. Use '/' for root. Example: '/css'"),
    },
    async ({ site_id, file_name, content, path }) => {
      const data = await api.post<{ file_name: string; uploaded: boolean }>(`/api/websites/${site_id}/files`, { path: path ?? "/", file_name, content });
      return { content: [{ type: "text" as const, text: `File '${file_name}' uploaded successfully.` }] };
    }
  );

  server.tool(
    "delete_file",
    "Delete a file from a website's storage. Example: 'Delete old-page.html from my website'.",
    {
      site_id: z.string().describe("The website ID (UUID). Get from list_websites."),
      file_name: z.string().describe("File name to delete. Example: 'old-page.html'"),
      path: z.string().optional().default("/").describe("Directory path. Example: '/', '/images'"),
    },
    async ({ site_id, file_name, path }) => {
      await api.del(`/api/websites/${site_id}/files/${encodeURIComponent(file_name)}?path=${encodeURIComponent(path ?? "/")}`);
      return { content: [{ type: "text" as const, text: `File '${file_name}' deleted.` }] };
    }
  );

  server.tool(
    "create_folder",
    "Create a new folder in a website's storage. Example: 'Create an images folder'.",
    {
      site_id: z.string().describe("The website ID (UUID). Get from list_websites."),
      folder_name: z.string().describe("Folder name. Example: 'images', 'css', 'js'"),
      path: z.string().optional().default("/").describe("Parent directory. Use '/' for root."),
    },
    async ({ site_id, folder_name, path }) => {
      await api.post(`/api/websites/${site_id}/folders`, { path: path ?? "/", folder_name });
      return { content: [{ type: "text" as const, text: `Folder '${folder_name}' created.` }] };
    }
  );

  server.tool(
    "publish_site",
    "Deploy multiple files to a website in one call. Pass a map of file paths to content. CDN cache is purged automatically. This is the best way to publish or update a website. Example: 'Build a landing page and publish it'.",
    {
      site_id: z.string().describe("The website ID (UUID). Get from list_websites or create one first."),
      files: z.record(z.string(), z.string()).describe("Map of file paths to content. Keys are paths (e.g. 'index.html', 'css/style.css'). Values are raw text content."),
      purge_cache: z.boolean().optional().default(true).describe("Purge CDN cache after upload. Default: true"),
    },
    async ({ site_id, files, purge_cache }) => {
      const data = await api.post<{ uploaded: string[]; errors: string[]; cdn_url: string }>(`/api/websites/${site_id}/publish`, { files, purge_cache: purge_cache ?? true });
      const lines = [`Published ${(data.uploaded || []).length} file(s) to ${data.cdn_url || ""}`];
      if (data.uploaded?.length) {
        lines.push("\nFiles:");
        for (const f of data.uploaded) lines.push(`  - ${data.cdn_url}/${f}`);
      }
      if (data.errors?.length) {
        lines.push(`\nErrors (${data.errors.length}):`);
        for (const e of data.errors) lines.push(`  - ${e}`);
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // CONTACTS
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    "list_contacts",
    "List contacts in your CRM with optional search and filtering. Returns name, email, phone, and lifecycle stage. Example: 'Show my contacts' or 'Find contacts named John'.",
    {
      search: z.string().optional().describe("Search by name, email, or phone"),
      lifecycle_stage: z.enum(["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist", "other"]).optional().describe("Filter by lifecycle stage"),
      limit: z.number().optional().default(25).describe("Max results (default 25, max 100)"),
      page: z.number().optional().default(1).describe("Page number"),
    },
    async ({ search, lifecycle_stage, limit, page }) => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (lifecycle_stage) params.set("lifecycle_stage", lifecycle_stage);
      params.set("limit", String(Math.min(limit ?? 25, 100)));
      params.set("page", String(page ?? 1));
      const data = await api.get<{ data: Array<Record<string, unknown>>; total: number }>(`/api/leads?${params.toString()}`);
      const leads = data.data || [];
      if (leads.length === 0) return { content: [{ type: "text" as const, text: "No contacts found." }] };
      const lines = leads.map((c) => {
        const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed";
        const parts = [`- ${name}`];
        if (c.email) parts.push(`email: ${c.email}`);
        if (c.phone) parts.push(`phone: ${c.phone}`);
        if (c.lifecycle_stage) parts.push(`stage: ${c.lifecycle_stage}`);
        parts.push(`id: ${c.id}`);
        return parts.join(" | ");
      });
      return { content: [{ type: "text" as const, text: `Found ${data.total} contact(s):\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "get_contact",
    "Get detailed information about a specific contact including all fields, tags, and notes. Example: 'Show me details for contact <id>'.",
    { contact_id: z.string().describe("The contact ID (UUID)") },
    async ({ contact_id }) => {
      const data = await api.get<{ lead: Record<string, unknown> }>(`/api/leads/${contact_id}/view`);
      const c = data.lead || data;
      const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed";
      const lines = [`Contact: ${name}`];
      for (const key of ["email", "phone", "company", "lifecycle_stage", "lead_source", "city", "state", "country"]) {
        if (c[key]) lines.push(`  ${key}: ${c[key]}`);
      }
      const tags = c.tags as string[] | undefined;
      if (tags?.length) lines.push(`  tags: ${tags.join(", ")}`);
      lines.push(`  id: ${c.id}`);
      lines.push(`  created: ${c.created_at}`);
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.tool(
    "create_contact",
    "Create a new contact in your CRM. Provide at least a name, email, or phone. Example: 'Add a contact named John Smith with email john@example.com'.",
    {
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      email: z.string().optional().describe("Email address"),
      phone: z.string().optional().describe("Phone number"),
      company: z.string().optional().describe("Company name"),
      lifecycle_stage: z.enum(["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist"]).optional().describe("Sales journey stage. Default: lead"),
      tags: z.array(z.string()).optional().describe("Tags to apply to this contact"),
    },
    async ({ first_name, last_name, email, phone, company, lifecycle_stage, tags }) => {
      const body: Record<string, unknown> = {};
      if (first_name) body.first_name = first_name;
      if (last_name) body.last_name = last_name;
      if (email) body.email = email;
      if (phone) body.phone = phone;
      if (company) body.company = company;
      if (lifecycle_stage) body.lifecycle_stage = lifecycle_stage;
      if (tags) body.tags = tags;
      const data = await api.post<{ id: string; first_name?: string; last_name?: string; email?: string }>("/api/leads", body);
      const name = `${data.first_name || ""} ${data.last_name || ""}`.trim() || "Unnamed";
      return { content: [{ type: "text" as const, text: `Contact "${name}" created!\n  ID: ${data.id}\n  Email: ${data.email || "—"}` }] };
    }
  );

  server.tool(
    "update_contact",
    "Update fields on an existing contact. Only the fields you provide are changed. Example: 'Update John's phone to 555-1234'.",
    {
      contact_id: z.string().describe("The contact ID (UUID)"),
      first_name: z.string().optional().describe("First name"),
      last_name: z.string().optional().describe("Last name"),
      email: z.string().optional().describe("Email address"),
      phone: z.string().optional().describe("Phone number"),
      company: z.string().optional().describe("Company name"),
      lifecycle_stage: z.enum(["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist"]).optional().describe("New lifecycle stage"),
      tags: z.array(z.string()).optional().describe("Replace tags with this list"),
    },
    async ({ contact_id, ...fields }) => {
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
      }
      await api.put(`/api/leads/${contact_id}`, updates);
      return { content: [{ type: "text" as const, text: `Contact ${contact_id} updated.` }] };
    }
  );

  server.tool(
    "delete_contact",
    "Delete a contact from your CRM (soft delete). Example: 'Delete contact <id>'.",
    { contact_id: z.string().describe("The contact ID (UUID)") },
    async ({ contact_id }) => {
      await api.del(`/api/leads/${contact_id}`);
      return { content: [{ type: "text" as const, text: `Contact ${contact_id} deleted.` }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    "list_pipelines",
    "List all sales pipelines with their stages. Shows pipeline name, stage names, and lead counts. Example: 'Show my pipelines' or 'What stages does my sales pipeline have?'.",
    {},
    async () => {
      const data = await api.get<{ pipelines: Array<{ id: string; name: string; columns: Array<{ id: string; name: string }> }> }>("/api/pipeline");
      const pipelines = data.pipelines || [];
      if (pipelines.length === 0) return { content: [{ type: "text" as const, text: "No pipelines found." }] };
      const lines = pipelines.map((p) => {
        const stages = (p.columns || []).map((c) => c.name).join(", ");
        return `- ${p.name} (${(p.columns || []).length} stages: ${stages}) id: ${p.id}`;
      });
      return { content: [{ type: "text" as const, text: `Found ${pipelines.length} pipeline(s):\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "get_pipeline_leads",
    "Get contacts/leads in a specific pipeline, optionally filtered by stage. Example: 'Show leads in my Sales pipeline' or 'Who is in the Negotiation stage?'.",
    {
      pipeline_id: z.string().describe("The pipeline ID (UUID)"),
      stage: z.string().optional().describe("Stage name to filter by"),
      limit: z.number().optional().default(25).describe("Max results (default 25)"),
    },
    async ({ pipeline_id, stage, limit }) => {
      const params = new URLSearchParams();
      params.set("pipeline_id", pipeline_id);
      if (stage) params.set("pipeline_stage", stage);
      params.set("limit", String(Math.min(limit ?? 25, 100)));
      const data = await api.get<{ data: Array<Record<string, unknown>>; total: number }>(`/api/leads?${params.toString()}`);
      const leads = data.data || [];
      if (leads.length === 0) return { content: [{ type: "text" as const, text: "No leads found in this pipeline." }] };
      const lines = leads.map((c) => {
        const name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed";
        return `- ${name} | stage: ${c.pipeline_stage_name || c.pipeline_stage || "—"} | id: ${c.id}`;
      });
      return { content: [{ type: "text" as const, text: `Found ${leads.length} lead(s) in pipeline:\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "move_lead_stage",
    "Move a contact to a different pipeline stage. Example: 'Move John to the Closed Won stage'.",
    {
      contact_id: z.string().describe("The contact ID (UUID)"),
      pipeline_id: z.string().describe("The pipeline ID (UUID)"),
      stage_id: z.string().describe("The target stage/column ID (UUID)"),
    },
    async ({ contact_id, pipeline_id, stage_id }) => {
      await api.put(`/api/leads/${contact_id}`, { pipeline_id, pipeline_stage_id: stage_id });
      return { content: [{ type: "text" as const, text: `Contact ${contact_id} moved to stage ${stage_id}.` }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // TASKS
  // ═══════════════════════════════════════════════════════════════════

  // ---------- Shared helpers ----------

  type TaskRow = Record<string, unknown>;

  function renderTaskLine(t: TaskRow): string {
    const parts = [`- ${t.title || "Untitled"}`];
    parts.push(`status: ${t.is_completed === true ? "completed" : "todo"}`);
    if (t.priority && t.priority !== "none") parts.push(`priority: ${t.priority}`);
    if (t.task_type) parts.push(`type: ${t.task_type}`);
    if (t.assigned_to_name) parts.push(`assignee: ${t.assigned_to_name}`);
    if (t.due_date) parts.push(`due: ${t.due_date}`);
    parts.push(`id: ${t.task_id}`);
    return parts.join(" | ");
  }

  function renderTaskFull(t: TaskRow): string {
    const lines: string[] = [];
    lines.push(`Title: ${t.title || "Untitled"}`);
    lines.push(`ID: ${t.task_id}`);
    lines.push(`Status: ${t.is_completed === true ? "completed" : "open"}${t.status_id ? ` (status_id: ${t.status_id})` : ""}`);
    if (t.priority) lines.push(`Priority: ${t.priority}`);
    if (t.task_type) lines.push(`Type: ${t.task_type}`);
    if (t.task_category) lines.push(`Category: ${t.task_category}`);
    if (t.project_id) lines.push(`Project: ${t.project_name || t.project_id}`);
    if (t.assigned_to_id) lines.push(`Assignee: ${t.assigned_to_name || t.assigned_to_id}`);
    if (t.related_lead_id) lines.push(`Contact: ${t.related_lead_name || t.related_lead_id}`);
    if (t.due_date) lines.push(`Due: ${t.due_date}${t.due_time ? ` ${t.due_time}` : ""}${t.due_date_timezone ? ` (${t.due_date_timezone})` : ""}`);
    if (t.duration) lines.push(`Duration: ${t.duration}m`);
    if (t.parent_task_id) lines.push(`Parent task: ${t.parent_task_id}`);
    if (typeof t.subtask_count === "number" && t.subtask_count > 0) lines.push(`Subtasks: ${t.subtask_count}`);
    if (t.is_snoozed) lines.push(`Snoozed until: ${t.snoozed_until}`);
    const tags = Array.isArray(t.tags) ? t.tags : [];
    if (tags.length > 0) lines.push(`Tags: ${tags.map((tag: unknown) => (typeof tag === "string" ? tag : (tag as Record<string, unknown>)?.name)).filter(Boolean).join(", ")}`);
    if (t.description) lines.push(`\nDescription:\n${t.description}`);
    const comments = Array.isArray(t.recent_comments) ? t.recent_comments as Array<Record<string, unknown>> : [];
    const userComments = comments.filter((c) => c.type !== "activity");
    if (userComments.length > 0) {
      lines.push(`\nComments (${userComments.length}):`);
      for (const c of userComments.slice(-10)) {
        lines.push(`  - [${c.created_at}] ${c.user_name || "?"}: ${c.content}`);
      }
    }
    const attachments = Array.isArray(t.attachments) ? t.attachments as Array<Record<string, unknown>> : [];
    if (attachments.length > 0) {
      lines.push(`\nAttachments (${attachments.length}):`);
      for (const a of attachments) {
        lines.push(`  - ${a.name || "(unnamed)"} → ${a.url || ""}`);
      }
    }
    return lines.join("\n");
  }

  async function fetchTask(taskId: string): Promise<TaskRow> {
    const res = await api.get<{ success: boolean; data: TaskRow }>(`/api/tasks/${taskId}`);
    return res.data || {};
  }

  // ---------- list_tasks ----------

  server.tool(
    "list_tasks",
    "List tasks with optional filtering by completion, priority, type, assignee, or search term. Example: 'Show my tasks', 'Show high priority open tasks', 'Tasks assigned to Alice'.",
    {
      is_completed: z.boolean().optional().describe("Filter by completion status. true = completed, false = open. Omit for all."),
      priority: z.enum(["low", "medium", "high", "urgent", "none"]).optional().describe("Filter by priority level"),
      task_type: z.string().optional().describe("Filter by task type key (use list_task_types to discover)"),
      assigned_to_id: z.string().optional().describe("Filter by assigned user UUID (use list_users to discover)"),
      project_id: z.string().optional().describe("Filter by project UUID (use list_projects to discover)"),
      search: z.string().optional().describe("Search keyword (matches title/description)"),
      limit: z.number().optional().default(25).describe("Max results (default 25, capped at 100)"),
    },
    async ({ is_completed, priority, task_type, assigned_to_id, project_id, search, limit }) => {
      const params = new URLSearchParams();
      if (is_completed !== undefined) params.set("is_completed", is_completed ? "true" : "false");
      if (priority) params.set("priority", priority);
      if (task_type) params.set("task_type", task_type);
      if (assigned_to_id) params.set("assignees[]", assigned_to_id);
      if (project_id) params.set("project_id", project_id);
      if (search) params.set("search_keyword", search);
      params.set("limit", String(Math.min(limit ?? 25, 100)));
      type Group = { leads?: TaskRow[]; total_count?: number };
      const response = await api.get<{ success: boolean; groups: Record<string, Group> }>(`/api/tasks?${params.toString()}`);
      const groups = response.groups || {};
      const tasks: TaskRow[] = [];
      let total = 0;
      for (const key of Object.keys(groups)) {
        const g = groups[key];
        if (Array.isArray(g.leads)) tasks.push(...g.leads);
        total += g.total_count ?? 0;
      }
      if (tasks.length === 0) return { content: [{ type: "text" as const, text: "No tasks found." }] };
      const lines = tasks.map(renderTaskLine);
      return { content: [{ type: "text" as const, text: `Found ${total || tasks.length} task(s):\n\n${lines.join("\n")}` }] };
    }
  );

  // ---------- create_task ----------

  server.tool(
    "create_task",
    "Create a new task. Supports the full task field set: assignee, priority, type, status, project, tags, due date with time/timezone, duration, subtask parent, and contact link. Use list_users / list_projects / list_task_statuses / list_task_types to discover valid IDs. Example: 'Create a high priority task to follow up with John tomorrow'.",
    {
      title: z.string().describe("Task title (required)"),
      description: z.string().optional().describe("Task description"),
      priority: z.enum(["low", "medium", "high", "urgent", "none"]).optional().describe("Task priority"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      due_time: z.string().optional().describe("Due time, 12-hour format (e.g. '9:00 AM')"),
      due_date_type: z.enum(["floating", "local"]).optional().describe("Date type: 'floating' (same wall-clock everywhere) or 'local' (timezone-anchored)"),
      due_date_timezone: z.string().optional().describe("IANA timezone for 'local' dates (e.g. 'America/New_York')"),
      duration: z.union([z.number(), z.string()]).optional().describe("Task duration in minutes (int) or string ('15m', '1h30m')"),
      task_type: z.string().optional().describe("Task type key — use list_task_types to discover valid keys for the target project"),
      task_category: z.enum(["prospecting", "qualification", "follow_up", "closing", "onboarding"]).optional().describe("Task category"),
      status_id: z.string().optional().describe("Custom status UUID — use list_task_statuses to discover values for the target project"),
      is_completed: z.boolean().optional().describe("Initial completion state (default false). When true, a follow-up PUT marks the task complete after creation."),
      assigned_to_id: z.string().optional().describe("UUID of user to assign — use list_users to discover"),
      related_lead_id: z.string().optional().describe("Contact UUID to link this task to"),
      contact_id: z.string().optional().describe("Alias for related_lead_id"),
      project_id: z.string().optional().describe("Project UUID — use list_projects to discover; defaults to the tenant's Default project"),
      parent_task_id: z.string().optional().describe("UUID of a parent task to make this a subtask"),
      tags: z.array(z.string()).optional().describe("Tag strings"),
    },
    async (input) => {
      const { title, is_completed, contact_id, related_lead_id, tags, ...rest } = input;
      const body: Record<string, unknown> = { title };
      const passthrough = ["description", "priority", "due_date", "due_time", "due_date_type", "due_date_timezone", "duration", "task_type", "task_category", "status_id", "assigned_to_id", "project_id", "parent_task_id"] as const;
      for (const k of passthrough) {
        const v = (rest as Record<string, unknown>)[k];
        if (v !== undefined) body[k] = v;
      }
      const lead = related_lead_id ?? contact_id;
      if (lead) body.related_lead_id = lead;
      if (Array.isArray(tags) && tags.length > 0) body.tags = tags.map((t) => ({ name: t }));

      const response = await api.post<{ success: boolean; data: TaskRow }>("/api/tasks", body);
      const task = response.data || {};
      const taskId = (task.task_id ?? "") as string;

      if (is_completed === true && task.is_completed !== true && taskId) {
        await api.patch(`/api/tasks/${taskId}/complete`, { is_completed: true });
        task.is_completed = true;
      }

      return { content: [{ type: "text" as const, text: `Task created.\n\n${renderTaskFull(task)}` }] };
    }
  );

  // ---------- update_task ----------

  server.tool(
    "update_task",
    "Update fields on an existing task. Use is_completed (boolean) to toggle completion — there is no flat 'status' enum on the backend; for custom statuses use status_id with values from list_task_statuses. Example: 'Set task <id> priority to urgent and assign to Alice'.",
    {
      task_id: z.string().describe("Task UUID"),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent", "none"]).optional(),
      due_date: z.string().optional().describe("YYYY-MM-DD"),
      due_time: z.string().optional().describe("12-hour format, e.g. '9:00 AM'"),
      due_date_type: z.enum(["floating", "local"]).optional(),
      due_date_timezone: z.string().optional(),
      duration: z.union([z.number(), z.string()]).optional(),
      task_type: z.string().optional().describe("Task type key from list_task_types"),
      task_category: z.enum(["prospecting", "qualification", "follow_up", "closing", "onboarding"]).optional(),
      status_id: z.string().optional().describe("Custom status UUID from list_task_statuses"),
      is_completed: z.boolean().optional().describe("Toggle completion"),
      assigned_to_id: z.string().optional().describe("UUID of user to assign"),
      related_lead_id: z.string().optional(),
      project_id: z.string().optional(),
      tags: z.array(z.string()).optional(),
      action_outcome: z.enum(["success", "no_answer", "left_voicemail", "bounced", "replied", "declined"]).optional(),
      action_outcome_notes: z.string().optional(),
      action_completed: z.boolean().optional(),
      is_snoozed: z.boolean().optional(),
      snoozed_until: z.string().optional().describe("ISO datetime"),
    },
    async ({ task_id, tags, ...fields }) => {
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
      }
      if (Array.isArray(tags)) updates.tags = tags.map((t) => ({ name: t }));
      if (Object.keys(updates).length === 0) {
        return { content: [{ type: "text" as const, text: "No fields to update." }] };
      }
      const res = await api.put<{ success: boolean; data: TaskRow }>(`/api/tasks/${task_id}`, updates);
      const task = res.data || {};
      return { content: [{ type: "text" as const, text: `Task updated.\n\n${renderTaskFull(task)}` }] };
    }
  );

  // ---------- delete_task ----------

  server.tool(
    "delete_task",
    "Soft-delete a task. Example: 'Delete task <id>'.",
    { task_id: z.string().describe("The task ID (UUID)") },
    async ({ task_id }) => {
      await api.del(`/api/tasks/${task_id}`);
      return { content: [{ type: "text" as const, text: `Task ${task_id} deleted.` }] };
    }
  );

  // ---------- get_task ----------

  server.tool(
    "get_task",
    "Get full detail for a single task — fields, comments, attachments, subtask count. Example: 'Show me task <id>'.",
    { task_id: z.string().describe("The task ID (UUID)") },
    async ({ task_id }) => {
      const task = await fetchTask(task_id);
      if (!task || !task.task_id) {
        return { content: [{ type: "text" as const, text: `Task ${task_id} not found.` }] };
      }
      return { content: [{ type: "text" as const, text: renderTaskFull(task) }] };
    }
  );

  // ---------- complete_task ----------

  server.tool(
    "complete_task",
    "Mark a task as completed (or reopen with is_completed=false). Example: 'Mark task <id> as done'.",
    {
      task_id: z.string().describe("Task UUID"),
      is_completed: z.boolean().optional().default(true).describe("true to complete (default), false to reopen"),
    },
    async ({ task_id, is_completed }) => {
      const res = await api.patch<{ success: boolean; data: TaskRow }>(`/api/tasks/${task_id}/complete`, { is_completed: is_completed ?? true });
      const task = res.data || {};
      const state = task.is_completed === true ? "completed" : "open";
      return { content: [{ type: "text" as const, text: `Task ${task_id} → ${state}.` }] };
    }
  );

  // ---------- snooze_task ----------

  server.tool(
    "snooze_task",
    "Snooze a task until a future datetime. Example: 'Snooze task <id> until tomorrow 9am'.",
    {
      task_id: z.string().describe("Task UUID"),
      snoozed_until: z.string().describe("ISO datetime (e.g. '2026-05-20T09:00:00Z')"),
    },
    async ({ task_id, snoozed_until }) => {
      const res = await api.patch<{ success: boolean; data: TaskRow }>(`/api/tasks/${task_id}/snooze`, { snoozed_until });
      const task = res.data || {};
      return { content: [{ type: "text" as const, text: `Task ${task_id} snoozed until ${task.snoozed_until || snoozed_until}.` }] };
    }
  );

  // ---------- list_subtasks ----------

  server.tool(
    "list_subtasks",
    "List all subtasks of a parent task. To create a subtask, call create_task with parent_task_id. Example: 'Show subtasks of task <id>'.",
    { task_id: z.string().describe("Parent task UUID") },
    async ({ task_id }) => {
      const res = await api.get<{ success: boolean; data: TaskRow[] }>(`/api/tasks/${task_id}/subtasks`);
      const subs = Array.isArray(res.data) ? res.data : [];
      if (subs.length === 0) return { content: [{ type: "text" as const, text: "No subtasks." }] };
      return { content: [{ type: "text" as const, text: `Found ${subs.length} subtask(s):\n\n${subs.map(renderTaskLine).join("\n")}` }] };
    }
  );

  // ---------- add_task_comment ----------

  server.tool(
    "add_task_comment",
    "Add a comment to a task's activity timeline. The comment is appended to the task's recent_comments array; auto-generated activity entries (field changes) are preserved. Example: 'Comment on task <id>: spoke with client, will reschedule'.",
    {
      task_id: z.string().describe("Task UUID"),
      content: z.string().describe("Comment text"),
    },
    async ({ task_id, content }) => {
      const existing = await fetchTask(task_id);
      if (!existing || !existing.task_id) {
        return { content: [{ type: "text" as const, text: `Task ${task_id} not found.` }] };
      }
      // Identity is resolved server-side from the API key's authenticated context.
      // The client must NEVER send user_id or user_name — they will be stamped by app-aie.
      const comments = Array.isArray(existing.recent_comments) ? [...existing.recent_comments as Array<Record<string, unknown>>] : [];
      const newComment = {
        id: crypto.randomUUID(),
        type: "comment",
        content,
        created_at: new Date().toISOString(),
      };
      comments.push(newComment);
      const res = await api.put<{ success: boolean; data: TaskRow }>(`/api/tasks/${task_id}`, { recent_comments: comments });
      const persisted = res.data?.recent_comments as Array<Record<string, unknown>> | undefined;
      const added = Array.isArray(persisted) ? persisted.find((c) => c.id === newComment.id) : null;
      const authorName = (added?.user_name as string) || "(server-resolved)";
      return { content: [{ type: "text" as const, text: `Comment added to task ${task_id}.\n  ${authorName}: ${content}` }] };
    }
  );

  // ---------- add_task_attachment ----------

  server.tool(
    "add_task_attachment",
    "Attach a file to a task. Provide either a local file_path (uploaded to Votel storage) or a pre-hosted url. Example: 'Attach /tmp/proposal.pdf to task <id>'.",
    {
      task_id: z.string().describe("Task UUID"),
      file_path: z.string().optional().describe("Absolute local file path to upload"),
      url: z.string().optional().describe("Pre-hosted URL (skips upload)"),
      name: z.string().optional().describe("Display name (defaults to filename or URL basename)"),
    },
    async ({ task_id, file_path, url, name }) => {
      if (!file_path && !url) {
        return { content: [{ type: "text" as const, text: "Provide either file_path or url." }] };
      }

      const existing = await fetchTask(task_id);
      if (!existing || !existing.task_id) {
        return { content: [{ type: "text" as const, text: `Task ${task_id} not found.` }] };
      }

      let attachment: Record<string, unknown>;
      if (file_path) {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const buf = await fs.readFile(file_path);
        const filename = name || path.basename(file_path);
        const form = new FormData();
        form.set("file", new Blob([new Uint8Array(buf)]), filename);
        const uploaded = await api.postForm<Record<string, unknown>>("/api/storage/attachment", form);
        attachment = {
          name: (uploaded.name as string) || filename,
          url: uploaded.url,
          ...uploaded,
        };
      } else {
        const fallbackName = name || (url ? url.split("/").pop() || url : "attachment");
        attachment = { name: fallbackName, url };
      }

      const attachments = Array.isArray(existing.attachments) ? [...existing.attachments as Array<Record<string, unknown>>] : [];
      attachments.push(attachment);
      await api.put(`/api/tasks/${task_id}`, { attachments });
      return { content: [{ type: "text" as const, text: `Attached "${attachment.name}" to task ${task_id}.\n  URL: ${attachment.url}` }] };
    }
  );

  // ---------- remove_task_attachment ----------

  server.tool(
    "remove_task_attachment",
    "Remove an attachment from a task by its display name. Does not delete the underlying file from storage. Example: 'Remove proposal.pdf from task <id>'.",
    {
      task_id: z.string().describe("Task UUID"),
      attachment_name: z.string().describe("Name of the attachment to remove (must match exactly)"),
    },
    async ({ task_id, attachment_name }) => {
      const existing = await fetchTask(task_id);
      if (!existing || !existing.task_id) {
        return { content: [{ type: "text" as const, text: `Task ${task_id} not found.` }] };
      }
      const before = Array.isArray(existing.attachments) ? existing.attachments as Array<Record<string, unknown>> : [];
      const after = before.filter((a) => a.name !== attachment_name);
      if (after.length === before.length) {
        return { content: [{ type: "text" as const, text: `No attachment named "${attachment_name}" on task ${task_id}.` }] };
      }
      await api.put(`/api/tasks/${task_id}`, { attachments: after });
      return { content: [{ type: "text" as const, text: `Removed "${attachment_name}" from task ${task_id}.` }] };
    }
  );

  // ---------- Lookup tools ----------

  server.tool(
    "list_users",
    "List users in the workspace — use to discover assigned_to_id values for tasks. Example: 'Who can I assign tasks to?'.",
    {
      query: z.string().optional().describe("Substring filter on name or email (client-side)"),
    },
    async ({ query }) => {
      type User = { id: string; name: string; email?: string; role?: string; status?: string };
      const res = await api.get<{ users: User[]; total_count: number }>("/api/users?for_options=true");
      let users = res.users || [];
      if (query) {
        const q = query.toLowerCase();
        users = users.filter((u) => (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
      }
      if (users.length === 0) return { content: [{ type: "text" as const, text: "No users found." }] };
      const lines = users.map((u) => `- ${u.name}${u.email ? ` <${u.email}>` : ""} | role: ${u.role || "?"} | id: ${u.id}`);
      return { content: [{ type: "text" as const, text: `Found ${users.length} user(s):\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "list_projects",
    "List task projects/pipelines for the workspace. Each project has its own status set and task-type set. Example: 'Show me my projects'.",
    {},
    async () => {
      type Project = {
        id: string; name: string; status_template_id?: string; type_template_id?: string;
        is_default?: boolean; statuses?: Array<{ id: string; name: string; category: string; color: string }>;
        types?: Array<{ key: string; label: string }>;
      };
      const res = await api.get<{ projects: Project[] }>("/api/projects/");
      const projects = res.projects || [];
      if (projects.length === 0) return { content: [{ type: "text" as const, text: "No projects found." }] };
      const lines = projects.map((p) => {
        const statusCount = (p.statuses || []).length;
        const typeCount = (p.types || []).length;
        return `- ${p.name}${p.is_default ? " (default)" : ""} | statuses: ${statusCount} | types: ${typeCount} | id: ${p.id}`;
      });
      return { content: [{ type: "text" as const, text: `Found ${projects.length} project(s):\n\n${lines.join("\n")}\n\nUse list_task_statuses(project_id=...) or list_task_types(project_id=...) for detail.` }] };
    }
  );

  server.tool(
    "list_task_statuses",
    "List the custom statuses available for a project (or for the project that contains a given task). Statuses are scoped per-project, NOT per task_type. Example: 'What statuses can I set on task <id>?'.",
    {
      project_id: z.string().optional().describe("Project UUID. Omit if task_id is provided."),
      task_id: z.string().optional().describe("Task UUID — resolves to its project."),
    },
    async ({ project_id, task_id }) => {
      let targetProjectId = project_id;
      if (!targetProjectId && task_id) {
        const t = await fetchTask(task_id);
        targetProjectId = t.project_id as string | undefined;
        if (!targetProjectId) {
          return { content: [{ type: "text" as const, text: `Task ${task_id} has no project_id.` }] };
        }
      }
      if (!targetProjectId) {
        return { content: [{ type: "text" as const, text: "Provide either project_id or task_id." }] };
      }
      type Project = { id: string; name: string; statuses?: Array<{ id: string; name: string; category: string; color: string; position: number }> };
      const res = await api.get<{ projects: Project[] }>("/api/projects/");
      const proj = (res.projects || []).find((p) => p.id === targetProjectId);
      if (!proj) {
        return { content: [{ type: "text" as const, text: `Project ${targetProjectId} not found.` }] };
      }
      const statuses = (proj.statuses || []).slice().sort((a, b) => a.position - b.position);
      if (statuses.length === 0) {
        return { content: [{ type: "text" as const, text: `Project "${proj.name}" has no statuses defined.` }] };
      }
      const lines = statuses.map((s) => `- ${s.name} | category: ${s.category} | color: ${s.color} | id: ${s.id}`);
      return { content: [{ type: "text" as const, text: `Statuses for project "${proj.name}":\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "list_task_types",
    "List the task types available for a project (or for the project that contains a given task). Each type has a 'key' (used as task_type on a task) and a display 'label'. Example: 'What task types can I use in project <id>?'.",
    {
      project_id: z.string().optional().describe("Project UUID. Omit if task_id is provided."),
      task_id: z.string().optional().describe("Task UUID — resolves to its project."),
    },
    async ({ project_id, task_id }) => {
      let targetProjectId = project_id;
      if (!targetProjectId && task_id) {
        const t = await fetchTask(task_id);
        targetProjectId = t.project_id as string | undefined;
        if (!targetProjectId) {
          return { content: [{ type: "text" as const, text: `Task ${task_id} has no project_id.` }] };
        }
      }
      if (!targetProjectId) {
        return { content: [{ type: "text" as const, text: "Provide either project_id or task_id." }] };
      }
      type Project = { id: string; name: string; types?: Array<{ key: string; label: string; color: string; icon?: string; position: number }> };
      const res = await api.get<{ projects: Project[] }>("/api/projects/");
      const proj = (res.projects || []).find((p) => p.id === targetProjectId);
      if (!proj) {
        return { content: [{ type: "text" as const, text: `Project ${targetProjectId} not found.` }] };
      }
      const types = (proj.types || []).slice().sort((a, b) => a.position - b.position);
      if (types.length === 0) {
        return { content: [{ type: "text" as const, text: `Project "${proj.name}" has no task types defined.` }] };
      }
      const lines = types.map((t) => `- ${t.label} | key: ${t.key} | color: ${t.color}${t.icon ? ` | icon: ${t.icon}` : ""}`);
      return { content: [{ type: "text" as const, text: `Task types for project "${proj.name}":\n\n${lines.join("\n")}\n\nUse the 'key' value as task_type when creating or updating tasks.` }] };
    }
  );

  server.tool(
    "list_task_tags",
    "Autocomplete task tag suggestions. Example: 'What tags exist for tasks?' or 'Tags starting with foll'.",
    {
      query: z.string().optional().describe("Substring filter"),
      limit: z.number().optional().default(50).describe("Max results"),
    },
    async ({ query, limit }) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      params.set("limit", String(limit ?? 50));
      const res = await api.get<{ options: Array<{ value: string; label: string }> }>(`/api/tasks/tags/autocomplete?${params.toString()}`);
      const options = res.options || [];
      if (options.length === 0) return { content: [{ type: "text" as const, text: "No tags found." }] };
      return { content: [{ type: "text" as const, text: `Found ${options.length} tag(s):\n${options.map((o) => `- ${o.value}`).join("\n")}` }] };
    }
  );

  server.tool(
    "get_task_stats",
    "Summary task statistics for the workspace — counts by status, priority, etc. Optional filter by assignee. Example: 'Give me task stats' or 'Show task stats for Alice'.",
    {
      assigned_to_id: z.string().optional().describe("Filter to a single user's tasks (use list_users)"),
    },
    async ({ assigned_to_id }) => {
      const params = new URLSearchParams();
      if (assigned_to_id) params.set("assigned_to_id", assigned_to_id);
      const qs = params.toString();
      const res = await api.get<{ success: boolean; data: Record<string, unknown> }>(`/api/tasks/stats/summary${qs ? `?${qs}` : ""}`);
      const data = res.data || {};
      const json = JSON.stringify(data, null, 2);
      return { content: [{ type: "text" as const, text: `Task stats:\n\n${json}` }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    "get_contact_activity",
    "Get recent activity for a contact — calls, emails, SMS, notes, and system events. Example: 'Show recent activity for John' or 'What happened with contact <id>?'.",
    {
      contact_id: z.string().describe("The contact ID (UUID)"),
      limit: z.number().optional().default(20).describe("Max results (default 20)"),
      activity_type: z.enum(["call", "email", "sms", "note", "system"]).optional().describe("Filter by activity type. Omit to show all."),
    },
    async ({ contact_id, limit, activity_type }) => {
      const params = new URLSearchParams();
      params.set("limit", String(Math.min(limit ?? 20, 50)));
      if (activity_type) params.set("activity_type", activity_type);
      const data = await api.get<{ activities: Array<Record<string, unknown>>; total: number }>(`/api/activities/lead/${contact_id}?${params.toString()}`);
      const activities = data.activities || [];
      if (activities.length === 0) return { content: [{ type: "text" as const, text: "No activity found for this contact." }] };
      const lines = activities.map((a) => {
        const atype = a.activity_type || a.type || "";
        let summary = (a.summary || a.content || a.description || "") as string;
        if (summary.length > 120) summary = summary.slice(0, 120) + "...";
        return `- [${atype}] ${summary} (${a.created_at})`;
      });
      return { content: [{ type: "text" as const, text: `Recent activity (${activities.length} items):\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "send_sms",
    "Send an SMS text message to a contact. The contact must have a phone number on file. Example: 'Send John a text saying: Your appointment is confirmed for tomorrow at 2pm'.",
    {
      contact_id: z.string().describe("The contact ID (UUID) to send to"),
      message: z.string().describe("The SMS message text"),
    },
    async ({ contact_id, message }) => {
      const data = await api.post<{ success?: boolean; error?: string }>("/api/sms/send", { lead_id: contact_id, message });
      if (data.success === false) return { content: [{ type: "text" as const, text: `Failed to send SMS: ${data.error || "Unknown error"}` }] };
      return { content: [{ type: "text" as const, text: `SMS sent to contact ${contact_id}: "${message}"` }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOM FIELDS
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    "list_contact_fields",
    "List all contact fields (built-in and custom) with their types and visibility. Useful for understanding what data you can store on contacts. Example: 'What fields are available for contacts?' or 'Show custom fields'.",
    {},
    async () => {
      const data = await api.get<{ categories: Array<{ name: string; fields: Array<{ field_name: string; label: string; data_type: string; visible: boolean; is_custom: boolean }> }> }>("/api/lead-fields/categories");
      const categories = data.categories || [];
      if (categories.length === 0) return { content: [{ type: "text" as const, text: "No fields found." }] };
      const lines: string[] = [];
      for (const cat of categories) {
        lines.push(`\n${cat.name}:`);
        for (const f of cat.fields || []) {
          const marker = f.is_custom ? " [custom]" : "";
          const vis = f.visible ? "" : " [hidden]";
          lines.push(`  - ${f.label} (${f.field_name}) type: ${f.data_type}${marker}${vis}`);
        }
      }
      return { content: [{ type: "text" as const, text: `Contact fields:${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "create_custom_field",
    "Create a new custom field for contacts. Supports text, email, phone, dropdown, date, number, and textarea types. Example: 'Create a dropdown field called Industry with options: Tech, Healthcare, Finance'.",
    {
      label: z.string().describe("Display name for the field"),
      field_type: z.enum(["text", "email", "phone", "dropdown", "date", "number", "textarea"]).describe("Data type for the field"),
      options: z.array(z.string()).optional().describe("Dropdown options (only for dropdown type)"),
    },
    async ({ label, field_type, options }) => {
      const body: Record<string, unknown> = { label, data_type: field_type, visible: true };
      if (field_type === "dropdown" && options) {
        body.options = options.map((o) => ({ label: o, value: o }));
      }
      await api.post("/api/lead-fields/custom", body);
      return { content: [{ type: "text" as const, text: `Custom field "${label}" created (type: ${field_type}).${options ? ` Options: ${options.join(", ")}` : ""}` }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // GLOBAL VARIABLES
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    "list_variables",
    "List all global variables with their current values. These are used in templates, workflows, and agent prompts. Example: 'Show my global variables' or 'What variables are set?'.",
    {},
    async () => {
      const data = await api.get<Array<{ key: string; label: string; value: string; type: string }>>("/api/global-variables");
      const vars = Array.isArray(data) ? data : [];
      if (vars.length === 0) return { content: [{ type: "text" as const, text: "No global variables found." }] };
      const lines = vars.map((v) => `- ${v.label || v.key} (${v.key}) = ${v.value || "—"} [${v.type}]`);
      return { content: [{ type: "text" as const, text: `Found ${vars.length} variable(s):\n\n${lines.join("\n")}` }] };
    }
  );
}
