import { MCP_PLUGIN_ID } from './builtin/mcp.plugin';

/** Id of the WhatsApp engine bundled with OpenWA. */
export const WWJS_PLUGIN_ID = 'whatsapp-web.js';

/**
 * Plugins that ship with OpenWA (the bundled engine + the MCP facade). Flagged as
 * built-in in API responses; they cannot be uninstalled.
 */
export const BUILTIN_PLUGIN_IDS: readonly string[] = [WWJS_PLUGIN_ID, MCP_PLUGIN_ID];
