import { Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod/v4';
import { handleToolError, jsonToolResult, smartToolResult } from './tool-result';
import type { McpModuleOptions, McpRequestLike, McpTool } from './types';

const logger = new Logger('Mcp');

type HttpAdapter = NonNullable<HttpAdapterHost['httpAdapter']>;
type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Build the request stand-in passed to each tool's `run`, mirroring the slots an
 * Express request would expose to a guard. Headers come from the SDK's
 * `requestInfo`; `params`/`query`/`body` start empty and are filled from the
 * validated tool input (per the reflected param sources) before guards run, so a
 * guard reading `req.params.sessionId` decides identically over MCP and REST.
 */
function requestFromExtra(extra: ToolExtra): McpRequestLike {
  const info = extra.requestInfo;
  return { headers: info?.headers ?? {}, url: info?.url?.toString(), params: {}, query: {}, body: {} };
}

/** Build the MCP server and register every discovered tool on it. */
function createServer(tools: McpTool[], serverInfo: NonNullable<McpModuleOptions['serverInfo']>): McpServer {
  const server = new McpServer(
    { name: serverInfo.name, version: serverInfo.version },
    { capabilities: { tools: {}, logging: {} } },
  );
  for (const tool of tools) {
    // Pass a passthrough ZodObject when a whole-body param reflected no fields, so the
    // client's body keys survive instead of being stripped by an empty input schema.
    const inputSchema = tool.passthrough ? z.object(tool.inputShape).passthrough() : tool.inputShape;
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema },
      async (input: Record<string, unknown>, extra: ToolExtra) => {
        const disposition = (extra._meta?.disposition as 'json' | 'smart' | undefined) ?? tool.disposition;
        try {
          const result = await tool.run(input, requestFromExtra(extra));
          return disposition === 'json' ? jsonToolResult(result as object) : smartToolResult(result as object);
        } catch (error) {
          return handleToolError(error);
        }
      },
    );
  }
  return server;
}

/**
 * Mount the MCP Streamable-HTTP transport on the existing Nest/Express adapter
 * at `POST {basePath}` (default `/mcp`), single-port.
 *
 * Stateless (per the 2026 spec direction): each request mints a fresh transport
 * + server with `sessionIdGenerator: undefined`, handles exactly that request,
 * and tears down on response close. No `Mcp-Session-Id`, no session map, no
 * GET/DELETE reconnect - any request can hit any instance.
 */
export function mountMcpServer(httpAdapter: HttpAdapter, tools: McpTool[], options: McpModuleOptions): void {
  const basePath = (options.basePath ?? '/mcp').replace(/\/$/, '') || '/mcp';
  const serverInfo = options.serverInfo ?? { name: 'openwa', version: '0.0.0' };

  const handler: RequestHandler = async (req: Request, res: Response) => {
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = createServer(tools, serverInfo);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP request', error instanceof Error ? error.stack : String(error));
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  };

  const adapter = httpAdapter as unknown as { post: (path: string, ...handlers: RequestHandler[]) => unknown };
  adapter.post(basePath, express.json(), handler);
  logger.log(`MCP server mounted at POST ${basePath} (${tools.length} tools)`);
}
