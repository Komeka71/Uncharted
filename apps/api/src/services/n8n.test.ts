import { test, describe } from 'node:test';
import assert from 'node:assert';
import { notifyN8nWebhook, N8nWebhookPayload } from './n8n.js';

const basePayload: N8nWebhookPayload = {
  failureId: 'fail_abc123',
  projectId: 'demo-project',
  diagnosisId: 'diag_def456',
  summary: 'Build failed due to type mismatch',
  rootCause: 'TypeScript error in src/index.ts',
  confidence: 'high',
  category: 'build_compile',
  fixSteps: ['Run tsc --noEmit', 'Fix type mismatch'],
  source: 'hybrid',
  createdAt: '2026-10-31T12:00:00Z',
};

function mockFetch(response: Response | null, shouldThrow?: boolean): void {
  if (shouldThrow) {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as any;
  } else {
    globalThis.fetch = (async () => response) as any;
  }
}

function restoreFetch(): void {
  globalThis.fetch = undefined as any;
}

describe('notifyN8nWebhook', () => {
  test('skips request when webhookUrl is undefined', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as any;

    await notifyN8nWebhook(undefined, basePayload);

    assert.strictEqual(called, false);
    restoreFetch();
  });

  test('skips request when webhookUrl is empty string', async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as any;

    await notifyN8nWebhook('', basePayload);

    assert.strictEqual(called, false);
    restoreFetch();
  });

  test('sends POST with JSON content type and expected payload', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    let capturedBody: string | undefined;

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      capturedBody = init?.body as string | undefined;
      return new Response(null, { status: 200 });
    }) as any;

    await notifyN8nWebhook('https://example.com/webhook', basePayload);

    assert.strictEqual(capturedUrl, 'https://example.com/webhook');
    assert.strictEqual(capturedInit?.method, 'POST');
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    assert.strictEqual(headers?.['Content-Type'], 'application/json');
    assert.strictEqual(capturedBody, JSON.stringify(basePayload));
    restoreFetch();
  });

  test('non-2xx response does not reject', async () => {
    globalThis.fetch = (async () => {
      return new Response(null, { status: 500, statusText: 'Internal Server Error' });
    }) as any;

    const result = notifyN8nWebhook('https://example.com/webhook', basePayload);
    await assert.doesNotReject(result);
    restoreFetch();
  });

  test('network error does not reject', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network error');
    }) as any;

    const result = notifyN8nWebhook('https://example.com/webhook', basePayload);
    await assert.doesNotReject(result);
    restoreFetch();
  });

  test('timeout does not reject', async () => {
    // A fetch that never resolves, but respects AbortSignal by rejecting
    // when the controller aborts after 5 seconds.
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    }) as any;

    const start = Date.now();
    const result = notifyN8nWebhook('https://example.com/webhook', basePayload);
    await assert.doesNotReject(result);
    const elapsed = Date.now() - start;

    // Should time out around 5s, not hang indefinitely
    assert.ok(elapsed < 10000, `Expected timeout around 5s, got ${elapsed}ms`);
    restoreFetch();
  });

  test('does not log webhook URL or complete payload in warning', async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      warnings.push(args.join(' '));
    };

    globalThis.fetch = (async () => {
      throw new TypeError('network error');
    }) as any;

    await notifyN8nWebhook('https://secret-webhook-url.example.com/hook?token=abc123', basePayload);

    console.warn = originalWarn;

    const allWarnings = warnings.join(' ');
    assert.ok(!allWarnings.includes('secret-webhook-url'), 'Webhook URL should not be logged');
    assert.ok(!allWarnings.includes(JSON.stringify(basePayload)), 'Complete payload should not be logged');
    assert.ok(warnings.some((w) => w.includes('network error')), 'Should log a sanitized network error warning');
    restoreFetch();
  });

  test('returns Promise<void> and resolves after handled failures', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network error');
    }) as any;

    const result = notifyN8nWebhook('https://example.com/webhook', basePayload);
    assert.ok(result instanceof Promise);
    await assert.doesNotReject(result);
    restoreFetch();
  });
});