interface KVNamespace {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{
    keys: Array<{ name: string }>;
  }>;
}

interface CloudflareEnv {
  DB: KVNamespace;
}

declare namespace NodeJS {
  interface ProcessEnv extends Partial<CloudflareEnv> {
    DEEPSEEK_API_KEY?: string;
  }
}
