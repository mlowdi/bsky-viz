import { openSync, closeSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Profile {
  name: string;
  gguf: string;
  args: string[];
}

// llama-server embeddings mode requires n_batch >= n_ctx, and each input must fit one ubatch.
export const PROFILES: Record<string, Profile> = {
  embed: {
    name: 'embed',
    gguf: 'snowflake-arctic-embed-l-v2.0-q8_0.gguf',
    args: ['--embeddings', '-ngl', '99', '-c', '2048', '-b', '2048', '-ub', '2048'],
  },
  label: {
    name: 'label',
    gguf: 'gemma-4-E4B_q4_0-it.gguf',
    args: [
      '-ngl', '99', '-c', '16384', '-np', '1', '-b', '2048', '-ub', '2048',
      '-ctk', 'q8_0', '-ctv', 'q8_0', '-fa', 'on', '--jinja',
    ],
  },
};

const LLAMACPP_DIR = process.env.LLAMACPP_DIR || join(homedir(), '.local/llamacpp/llama-b9542');
const GGUF_DIR = process.env.BSKYVIZ_GGUF_DIR || join(homedir(), 'projects/local-llm/ggufs');
export const DEFAULT_PORT = parseInt(process.env.BSKYVIZ_LLAMA_PORT || '8092', 10);

export class ModelHost {
  port: number;
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private profileName: string | null = null;
  private logPath: string | null = null;
  private cleanupRegistered = false;

  constructor(port: number = DEFAULT_PORT) {
    this.port = port;
  }

  get base(): string {
    return `http://127.0.0.1:${this.port}/v1`;
  }

  async ensure(profileName: string): Promise<Profile> {
    const profile = PROFILES[profileName];
    if (!profile) throw new Error(`Unknown profile: ${profileName}`);
    if (this.profileName === profileName && this.alive()) return profile;
    await this.stopAndWait();
    await this.start(profile);
    return profile;
  }

  stop(): void {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    this.profileName = null;
    try { proc.kill(); } catch { /* already dead */ }
  }

  private async stopAndWait(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    this.stop();
    try { await proc.exited; } catch { /* already dead */ }
  }

  private alive(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }

  private registerCleanup(): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;
    process.on('exit', () => this.stop());
    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.on(sig, () => {
        this.stop();
        process.exit(130);
      });
    }
  }

  private logTail(n: number = 12): string {
    if (!this.logPath || !existsSync(this.logPath)) return '';
    const lines = readFileSync(this.logPath, 'utf-8').split('\n');
    return lines.slice(-n).join('\n');
  }

  private async start(profile: Profile): Promise<void> {
    const gguf = join(GGUF_DIR, profile.gguf);
    if (!existsSync(gguf)) throw new Error(`model file missing: ${gguf}`);
    const binary = join(LLAMACPP_DIR, 'llama-server');
    if (!existsSync(binary)) throw new Error(`llama-server binary missing: ${binary}`);

    this.registerCleanup();
    this.logPath = `/tmp/bsky-viz-llama-${profile.name}.log`;
    const logFd = openSync(this.logPath, 'a');

    const cmd = [
      binary, '-m', gguf,
      ...profile.args,
      '--host', '127.0.0.1', '--port', String(this.port),
    ];

    console.log(`model: loading ${profile.name} (${profile.gguf})`);
    const t0 = Date.now();
    this.proc = Bun.spawn(cmd, {
      stdout: logFd,
      stderr: logFd,
      env: { ...process.env, LD_LIBRARY_PATH: LLAMACPP_DIR },
    });
    closeSync(logFd);
    this.profileName = profile.name;

    await this.waitHealthy(180_000);
    console.log(`model: ${profile.name} ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  private async waitHealthy(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const url = `http://127.0.0.1:${this.port}/health`;
    while (Date.now() < deadline) {
      if (!this.alive()) {
        const code = this.proc?.exitCode ?? '?';
        this.proc = null;
        this.profileName = null;
        throw new Error(`llama-server exited during startup (code=${code}); see ${this.logPath}\n${this.logTail()}`);
      }
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.status === 200) return;
      } catch { /* not up yet */ }
      await Bun.sleep(500);
    }
    this.stop();
    throw new Error(`llama-server not healthy after ${timeoutMs / 1000}s; see ${this.logPath}`);
  }
}
