// Shared fetch plumbing for price adapters. Every adapter built on this gets a
// timeout, one retry on 5xx/network failure, and a User-Agent for free — and never
// has to handle a thrown error itself. See docs/tasks/T05-price-core.md.

const USER_AGENT =
  "brandstof-optimalisatie/1.0 (+https://github.com/NocturnalTomato/brandstof-optimalisatie)";

const DEFAULT_TIMEOUT_MS = 5_000;
const RETRY_BACKOFF_MS = 400;

export interface FetchJsonOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(url: string, options: FetchJsonOptions): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([timeoutSignal, options.signal])
    : timeoutSignal;

  return fetch(url, {
    signal,
    headers: { "User-Agent": USER_AGENT, ...options.headers },
  });
}

/**
 * Fetches and parses JSON. Never throws: a timeout, network failure, non-2xx
 * status, or malformed body all resolve to `null` after one retry on 5xx or a
 * network error (400 ms backoff). Adapters can treat `null` as "no data".
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T | null> {
  if (options.signal?.aborted) return null;

  for (let attemptNumber = 0; attemptNumber < 2; attemptNumber++) {
    let res: Response;
    try {
      res = await attempt(url, options);
    } catch {
      if (options.signal?.aborted || attemptNumber === 1) return null;
      await delay(RETRY_BACKOFF_MS);
      continue;
    }

    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        return null;
      }
    }

    if (res.status >= 500 && attemptNumber === 0) {
      await delay(RETRY_BACKOFF_MS);
      continue;
    }

    return null;
  }

  return null;
}
