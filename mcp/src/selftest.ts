// Starts the MCP server over stdio and calls two tools, like Claude Code would.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'selftest', version: '0' });
await client.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', 'mcp/src/index.ts'], env: { ...process.env } as Record<string, string> }));
const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));
const r = await client.callTool({ name: 'request_mandate', arguments: { task: 'I need a bag for my laptop charger' } });
console.log((r.content as any)[0].text.slice(0, 400));
await client.close();
