#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const DEFAULT_URL_FALLBACKS = ['http://localhost:5174', 'http://localhost:5173'];
let resolvedBaseUrl = (process.env.CHRONOLEDGER_URL || '').replace(/\/$/, '');
let activeToken = process.env.CHRONOLEDGER_TOKEN || '';

/**
 * Dynamically resolves the ChronoLedger API base URL
 */
async function getBaseUrl() {
  if (resolvedBaseUrl) return resolvedBaseUrl;

  for (const candidate of DEFAULT_URL_FALLBACKS) {
    try {
      const res = await fetch(`${candidate}/api/health`, { signal: AbortSignal.timeout(600) });
      if (res.ok) {
        resolvedBaseUrl = candidate;
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Default to 5174 if none answered
  resolvedBaseUrl = 'http://localhost:5174';
  return resolvedBaseUrl;
}

/**
 * Makes an HTTP request to the ChronoLedger API
 */
async function apiRequest(path, options = {}) {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new Error(`Failed to connect to ChronoLedger at ${base}: ${err.message}. Ensure the ChronoLedger server is running.`);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const errorMsg = data.error || data.message || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errorMsg);
  }

  return data;
}

// Initialize MCP Server
const server = new McpServer({
  name: 'chronoledger-notes',
  version: '1.0.0',
});

// --- TOOL: login ---
server.tool(
  'login',
  {
    email: z.string().describe('User email address'),
    password: z.string().describe('User password'),
  },
  async ({ email, password }) => {
    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, clientName: 'ChronoLedger MCP Server', clientType: 'mcp' }),
      });
      if (data.token) {
        activeToken = data.token;
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully authenticated as ${data.user?.email || email}. Session active for MCP tools.`,
            },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: '⚠️ Login response did not contain an authentication token.' }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ Authentication failed: ${err.message}` }], isError: true };
    }
  }
);

// --- TOOL: list_notes ---
server.tool(
  'list_notes',
  {
    scope: z.enum(['day', 'week', 'month', 'all']).optional().describe('Scope filter: day, week, month, or all (default all)'),
    date: z.string().optional().describe('Exact date in YYYY-MM-DD format (for day notes). If provided, takes precedence over startDate and endDate.'),
    startDate: z.string().optional().describe('Range start date in YYYY-MM-DD format (inclusive). Used when date is omitted.'),
    endDate: z.string().optional().describe('Range end date in YYYY-MM-DD format (inclusive). Used when date is omitted.'),
    week: z.string().optional().describe('Week key in YYYY-Www format (e.g. 2026-W42)'),
    month: z.string().optional().describe('Month key in YYYY-MM format (e.g. 2026-10)'),
    tag: z.string().optional().describe('Semantic tag name without @ (e.g. "todo", "wait", "important", "celebrate")'),
    status: z.enum(['all', 'open', 'completed']).optional().describe('Filter by open vs completed status'),
    query: z.string().optional().describe('Free-text search substring in note content'),
    limit: z.number().optional().describe('Maximum number of notes to return (default 50)'),
    offset: z.number().optional().describe('Pagination offset (default 0)'),
  },
  async (params) => {
    try {
      const query = new URLSearchParams();
      if (params.scope) query.set('scope', params.scope);
      if (params.date) query.set('date', params.date);
      if (params.startDate) query.set('start_date', params.startDate);
      if (params.endDate) query.set('end_date', params.endDate);
      if (params.week) query.set('week', params.week);
      if (params.month) query.set('month', params.month);
      if (params.tag) query.set('tag', params.tag);
      if (params.status) query.set('status', params.status);
      if (params.query) query.set('q', params.query);
      if (params.limit) query.set('limit', String(params.limit));
      if (params.offset) query.set('offset', String(params.offset));

      const data = await apiRequest(`/api/notes?${query.toString()}`);
      const notes = data.notes || [];

      if (notes.length === 0) {
        return {
          content: [{ type: 'text', text: 'No notes found matching the specified criteria.' }],
        };
      }

      const formatted = notes.map((n) => {
        const strikeMark = n.isStruck ? '~~[STRUCK]~~ ' : '';
        const targets = (n.targets || []).join(', ');
        return `• [${n.id}] (${n.scope.toUpperCase()}: ${targets}) ${strikeMark}${n.content}`;
      });

      return {
        content: [
          {
            type: 'text',
            text: `Found ${data.total} note(s):\n\n${formatted.join('\n')}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error listing notes: ${err.message}` }], isError: true };
    }
  }
);

// --- TOOL: get_note ---
server.tool(
  'get_note',
  {
    id: z.string().describe('The unique note ID to retrieve'),
  },
  async ({ id }) => {
    try {
      const note = await apiRequest(`/api/notes/${encodeURIComponent(id)}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(note, null, 2),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error fetching note ${id}: ${err.message}` }], isError: true };
    }
  }
);

// --- TOOL: create_note ---
server.tool(
  'create_note',
  {
    content: z.string().describe('Markdown note text (e.g. "@todo Prepare client slides @urgent")'),
    scope: z.enum(['day', 'week', 'month']).optional().describe('Scope: "day" (default), "week", or "month"'),
    date: z.string().optional().describe('Target date YYYY-MM-DD, week YYYY-Www, or month YYYY-MM. Defaults to current.'),
    colorTag: z.string().optional().describe('Optional hex color tint (e.g. #F47290)'),
  },
  async ({ content, scope = 'day', date, colorTag }) => {
    try {
      const body = {
        scope,
        content,
        colorTag,
        targets: date ? [date] : undefined,
      };

      const created = await apiRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Note created successfully!\n\nID: ${created.id}\nScope: ${created.scope}\nTarget(s): ${created.targets?.join(', ')}\nContent: ${created.content}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error creating note: ${err.message}` }], isError: true };
    }
  }
);

// --- TOOL: update_note ---
server.tool(
  'update_note',
  {
    id: z.string().describe('ID of note to update'),
    content: z.string().optional().describe('Updated markdown content for the note'),
    targets: z.array(z.string()).optional().describe('Updated target dates/weeks/months'),
    colorTag: z.string().optional().describe('Updated hex accent color'),
    isStruck: z.boolean().optional().describe('Mark note struck through (true) or active (false)'),
    preserveDiff: z.boolean().optional().describe('If true, records prior content for paper revision diffing'),
  },
  async ({ id, content, targets, colorTag, isStruck, preserveDiff }) => {
    try {
      const body = {};
      if (content !== undefined) body.content = content;
      if (targets !== undefined) body.targets = targets;
      if (colorTag !== undefined) body.colorTag = colorTag;
      if (isStruck !== undefined) body.isStruck = isStruck;
      if (preserveDiff !== undefined) body.preserveDiff = preserveDiff;

      const updated = await apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Note ${id} updated successfully!\nContent: ${updated.content}\nTargets: ${updated.targets?.join(', ')}\nStruck: ${updated.isStruck}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error updating note ${id}: ${err.message}` }], isError: true };
    }
  }
);

// --- TOOL: toggle_note_status ---
server.tool(
  'toggle_note_status',
  {
    id: z.string().describe('ID of note to toggle'),
    action: z.enum(['toggle_strike', 'resolve_tag', 'reopen_tag']).describe(
      'Action: "toggle_strike" strikes/unstrikes whole note; "resolve_tag" marks @tag as ~~@tag~~; "reopen_tag" marks ~~@tag~~ as @tag'
    ),
    tag: z.string().optional().describe('Tag name (without @) to resolve or reopen, e.g. "todo", "wait". Required for resolve_tag and reopen_tag.'),
  },
  async ({ id, action, tag }) => {
    try {
      if (action === 'toggle_strike') {
        const res = await apiRequest(`/api/notes/${encodeURIComponent(id)}/toggle-strike`, {
          method: 'POST',
        });
        return {
          content: [
            {
              type: 'text',
              text: `✅ Note ${id} strike status toggled: isStruck = ${res.isStruck}`,
            },
          ],
        };
      }

      if (!tag) {
        throw new Error('A tag name is required for resolve_tag or reopen_tag actions (e.g. tag: "todo")');
      }

      const cleanTag = tag.replace(/^@/, '');
      const note = await apiRequest(`/api/notes/${encodeURIComponent(id)}`);
      let content = note.content;

      if (action === 'resolve_tag') {
        // Replace unescaped @tag with ~~@tag~~
        const regex = new RegExp(`(^|[^\\\\])@${cleanTag}(?![a-zA-Z0-9_:-])`, 'i');
        if (!regex.test(content)) {
          return {
            content: [{ type: 'text', text: `Note ${id} does not contain an active @${cleanTag} tag to resolve.` }],
          };
        }
        content = content.replace(regex, `$1~~@${cleanTag}~~`);
      } else if (action === 'reopen_tag') {
        // Replace unescaped ~~@tag~~ with @tag
        const regex = new RegExp(`(^|[^\\\\])~~@${cleanTag}~~`, 'i');
        if (!regex.test(content)) {
          return {
            content: [{ type: 'text', text: `Note ${id} does not contain a resolved ~~@${cleanTag}~~ tag to reopen.` }],
          };
        }
        content = content.replace(regex, `$1@${cleanTag}`);
      }

      const updated = await apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Tag @${cleanTag} ${action === 'resolve_tag' ? 'resolved' : 'reopened'} on note ${id}!\nNew content: ${updated.content}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error toggling note ${id}: ${err.message}` }], isError: true };
    }
  }
);

// --- TOOL: delete_note ---
server.tool(
  'delete_note',
  {
    id: z.string().describe('ID of note to permanently delete'),
  },
  async ({ id }) => {
    try {
      const res = await apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return {
        content: [
          {
            type: 'text',
            text: `✅ Note ${res.deletedId} has been permanently deleted.`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error deleting note ${id}: ${err.message}` }], isError: true };
    }
  }
);

// --- TOOL: get_agenda_summary ---
server.tool(
  'get_agenda_summary',
  {
    date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today)'),
  },
  async ({ date }) => {
    try {
      const now = new Date();
      const targetDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // 1. Fetch notes on target date
      const dayData = await apiRequest(`/api/notes?scope=day&date=${targetDate}`);
      // 2. Fetch all active to-dos
      const todoData = await apiRequest(`/api/notes?tag=todo&status=open&limit=10`);
      // 3. Fetch all active waiting items
      const waitData = await apiRequest(`/api/notes?tag=wait&status=open&limit=10`);

      let summary = `# 📅 ChronoLedger Agenda: ${targetDate}\n\n`;

      summary += `### 📝 Notes for Today (${dayData.total}):\n`;
      if (dayData.notes.length === 0) {
        summary += '_No notes scheduled for this date._\n';
      } else {
        for (const n of dayData.notes) {
          summary += `- ${n.isStruck ? '~~[DONE]~~ ' : ''}${n.content} (id: \`${n.id}\`)\n`;
        }
      }

      summary += `\n### 🟢 Active To-Dos across Ledger (${todoData.total} total):\n`;
      if (todoData.notes.length === 0) {
        summary += '_No open to-dos!_\n';
      } else {
        for (const n of todoData.notes) {
          const targets = (n.targets || []).join(', ');
          summary += `- [${targets}] ${n.content} (\`${n.id}\`)\n`;
        }
      }

      summary += `\n### 🟠 Waiting-For Blockers (${waitData.total} total):\n`;
      if (waitData.notes.length === 0) {
        summary += '_No external dependencies waiting._\n';
      } else {
        for (const n of waitData.notes) {
          const targets = (n.targets || []).join(', ');
          summary += `- [${targets}] ${n.content} (\`${n.id}\`)\n`;
        }
      }

      return {
        content: [{ type: 'text', text: summary }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error generating agenda: ${err.message}` }], isError: true };
    }
  }
);

// --- RESOURCES ---
server.resource('today-agenda', 'chronoledger://today', async (uri) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dayData = await apiRequest(`/api/notes?scope=day&date=${today}`);
    const lines = [`# ChronoLedger Today (${today})`, ''];
    for (const n of dayData.notes || []) {
      lines.push(`- ${n.isStruck ? '~~[DONE]~~ ' : ''}${n.content}`);
    }
    return {
      contents: [{ uri: uri.href, text: lines.join('\n') }],
    };
  } catch (err) {
    return {
      contents: [{ uri: uri.href, text: `# Error loading today's agenda\n\n${err.message}` }],
    };
  }
});

server.resource('active-todos', 'chronoledger://todos/active', async (uri) => {
  try {
    const todoData = await apiRequest('/api/notes?tag=todo&status=open');
    const lines = ['# Active To-Dos', ''];
    for (const n of todoData.notes || []) {
      lines.push(`- [${n.targets?.join(', ')}] ${n.content}`);
    }
    return {
      contents: [{ uri: uri.href, text: lines.join('\n') }],
    };
  } catch (err) {
    return {
      contents: [{ uri: uri.href, text: `# Error loading todos\n\n${err.message}` }],
    };
  }
});

server.resource('waiting-items', 'chronoledger://waiting', async (uri) => {
  try {
    const waitData = await apiRequest('/api/notes?tag=wait&status=open');
    const lines = ['# Waiting-For Items', ''];
    for (const n of waitData.notes || []) {
      lines.push(`- [${n.targets?.join(', ')}] ${n.content}`);
    }
    return {
      contents: [{ uri: uri.href, text: lines.join('\n') }],
    };
  } catch (err) {
    return {
      contents: [{ uri: uri.href, text: `# Error loading waiting items\n\n${err.message}` }],
    };
  }
});

// Start Stdio Transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal MCP server error:', err);
  process.exit(1);
});
