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

  server.tool(
    "list_tasks",
    "List tasks with optional filtering by status or priority. Example: 'Show my tasks' or 'What tasks are due today?' or 'Show high priority tasks'.",
    {
      status: z.enum(["todo", "in_progress", "completed"]).optional().describe("Filter by task status"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Filter by priority level"),
      due_date: z.string().optional().describe("Filter by due date (YYYY-MM-DD). Example: '2026-04-06'"),
      limit: z.number().optional().default(25).describe("Max results (default 25)"),
    },
    async ({ status, priority, limit }) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      params.set("limit", String(Math.min(limit ?? 25, 100)));
      const data = await api.get<{ data: Array<Record<string, unknown>>; total: number }>(`/api/tasks?${params.toString()}`);
      const tasks = data.data || [];
      if (tasks.length === 0) return { content: [{ type: "text" as const, text: "No tasks found." }] };
      const lines = tasks.map((t) => {
        const parts = [`- ${t.title || "Untitled"}`];
        if (t.status) parts.push(`status: ${t.status}`);
        if (t.priority) parts.push(`priority: ${t.priority}`);
        if (t.due_date) parts.push(`due: ${t.due_date}`);
        parts.push(`id: ${t.id}`);
        return parts.join(" | ");
      });
      return { content: [{ type: "text" as const, text: `Found ${data.total || tasks.length} task(s):\n\n${lines.join("\n")}` }] };
    }
  );

  server.tool(
    "create_task",
    "Create a new task. Can optionally link to a contact. Example: 'Create a task to follow up with John tomorrow' or 'Add a high priority task: Review proposal'.",
    {
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium").describe("Task priority"),
      status: z.enum(["todo", "in_progress", "completed"]).optional().default("todo").describe("Initial status"),
      lead_id: z.string().optional().describe("Contact ID to link this task to"),
    },
    async ({ title, description, due_date, priority, status, lead_id }) => {
      const body: Record<string, unknown> = { title };
      if (description) body.description = description;
      if (due_date) body.due_date = due_date;
      if (priority) body.priority = priority;
      if (status) body.status = status;
      if (lead_id) body.lead_id = lead_id;
      const data = await api.post<{ id: string; title: string; status: string; priority: string }>("/api/tasks", body);
      return { content: [{ type: "text" as const, text: `Task "${data.title}" created!\n  ID: ${data.id}\n  Status: ${data.status}\n  Priority: ${data.priority || "medium"}` }] };
    }
  );

  server.tool(
    "update_task",
    "Update a task — change status, priority, due date, etc. Example: 'Mark task <id> as completed' or 'Change priority to urgent'.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
      title: z.string().optional().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("New priority level"),
      status: z.enum(["todo", "in_progress", "completed"]).optional().describe("New status"),
    },
    async ({ task_id, ...fields }) => {
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
      }
      await api.put(`/api/tasks/${task_id}`, updates);
      return { content: [{ type: "text" as const, text: `Task ${task_id} updated.` }] };
    }
  );

  server.tool(
    "delete_task",
    "Delete a task. Example: 'Delete task <id>'.",
    { task_id: z.string().describe("The task ID (UUID)") },
    async ({ task_id }) => {
      await api.del(`/api/tasks/${task_id}`);
      return { content: [{ type: "text" as const, text: `Task ${task_id} deleted.` }] };
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
