/**
 * Codex CLI Adapter
 * Uses `codex exec` CLI tool (OpenAI Codex)
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';

export class CodexCLIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'codex';
  readonly method: LLMMethod = 'cli';
  readonly name = 'Codex (CLI)';

  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(['which', 'codex'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }

  protected async callLLM(prompt: string): Promise<string> {
    // Codex exec expects the prompt as an argument
    const proc = Bun.spawn(['codex', 'exec', prompt], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Set timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Codex CLI timeout after ${this.timeout}ms`));
      }, this.timeout);
    });

    try {
      const result = await Promise.race([
        proc.exited.then(async () => {
          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();

          if (proc.exitCode !== 0) {
            throw new Error(`Codex CLI failed: ${stderr}`);
          }

          return stdout;
        }),
        timeoutPromise,
      ]);

      return result;
    } catch (error) {
      proc.kill();
      throw error;
    }
  }
}
