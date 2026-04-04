import type { JudgePlugin, AgentPlugin, JudgeContext } from "./protocol.js";
import type { JudgeResult, AgentResult, EvOrchEvent } from "../core/types.js";
import { ShellJudge } from "./judges/shell.js";
import { ClaudeCodeAgent } from "./agents/claude-code.js";
import { ShellAgent } from "./agents/shell.js";

const BUILTIN_JUDGES: Record<string, () => JudgePlugin> = {
  shell: () => new ShellJudge(),
};

const BUILTIN_AGENTS: Record<string, () => AgentPlugin> = {
  "claude-code": () => new ClaudeCodeAgent(),
  shell: () => new ShellAgent(),
};

export class PluginRuntime {
  private judgeCache = new Map<string, JudgePlugin>();
  private agentCache = new Map<string, AgentPlugin>();

  async runJudge(
    pluginName: string,
    config: Record<string, unknown>,
    context: JudgeContext,
  ): Promise<JudgeResult> {
    const plugin = this.resolveJudge(pluginName);
    return plugin.run(config, context);
  }

  async runAgent(
    pluginName: string,
    config: Record<string, unknown>,
    event: EvOrchEvent,
  ): Promise<AgentResult> {
    const plugin = this.resolveAgent(pluginName);
    return plugin.run(config, event);
  }

  private resolveJudge(name: string): JudgePlugin {
    let plugin = this.judgeCache.get(name);
    if (!plugin) {
      const factory = BUILTIN_JUDGES[name];
      if (!factory) {
        throw new Error(`judge プラグインが見つかりません: ${name}`);
      }
      plugin = factory();
      this.judgeCache.set(name, plugin);
    }
    return plugin;
  }

  private resolveAgent(name: string): AgentPlugin {
    let plugin = this.agentCache.get(name);
    if (!plugin) {
      const factory = BUILTIN_AGENTS[name];
      if (!factory) {
        throw new Error(`agent プラグインが見つかりません: ${name}`);
      }
      plugin = factory();
      this.agentCache.set(name, plugin);
    }
    return plugin;
  }
}
