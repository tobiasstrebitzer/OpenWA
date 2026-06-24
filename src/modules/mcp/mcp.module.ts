import { Inject, Module, type DynamicModule, type NestModule } from '@nestjs/common';
import { DiscoveryModule, HttpAdapterHost } from '@nestjs/core';
import { McpDiscovery } from './discovery';
import { mountMcpServer } from './mcp.server';
import { MCP_MODULE_OPTIONS, type McpModuleOptions } from './types';

/**
 * Opt-in MCP module. Discovers every `@Mcp()`-decorated controller route via
 * Nest's `DiscoveryService`, reflects each into an MCP tool (input schema from
 * the route + parameter decorators + `class-validator`/`@nestjs/swagger`), and
 * mounts a stateless Streamable-HTTP transport on the existing Express instance
 * at `/mcp`.
 *
 * Registered only when `MCP_ENABLED=true` (see `app.module.ts`), so a default
 * boot loads none of this module's code or the MCP SDK. REST is untouched -
 * controllers keep serving HTTP exactly as before; `@Mcp()` is purely additive.
 *
 * `configure()` runs during `registerModules` - before Nest's `registerRouter()`
 * step - so the MCP route sits ahead of the controller routes in the Express
 * stack without disturbing them.
 */
@Module({})
export class McpModule implements NestModule {
  constructor(
    @Inject(MCP_MODULE_OPTIONS) private readonly options: McpModuleOptions,
    private readonly discovery: McpDiscovery,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  static forRoot(options: McpModuleOptions = {}): DynamicModule {
    return {
      module: McpModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [{ provide: MCP_MODULE_OPTIONS, useValue: options }, McpDiscovery],
      exports: [],
    };
  }

  configure(): void {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    if (!httpAdapter) {
      throw new Error('McpModule: HttpAdapterHost.httpAdapter is not available.');
    }
    const tools = this.discovery.discover({
      globalGuards: this.options.globalGuards,
      defaultResult: this.options.defaultResult,
    });
    mountMcpServer(httpAdapter, tools, this.options);
  }
}
