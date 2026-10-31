/**
 * Payload shape for n8n outbound webhook notifications.
 * Contains only fields that exist on the Diagnosis type or in the
 * orchestration context. No secrets, raw logs, or credentials.
 */
export interface N8nWebhookPayload {
  failureId: string;
  projectId: string;
  diagnosisId: string;
  summary: string;
  rootCause: string;
  confidence: 'low' | 'medium' | 'high';
  category: string;
  fixSteps: string[];
  source: 'rules' | 'hybrid';
  createdAt?: string;
}

/**
 * Sends a diagnosis notification to an n8n webhook.
 *
 * The helper never rejects: network errors, timeouts, and non-2xx
 * responses are all caught and logged with a sanitized warning.
 * The webhook URL is never logged.
 *
 * @param webhookUrl - The n8n webhook URL, or undefined/empty to skip.
 * @param payload - The typed webhook payload.
 * @returns A promise that always resolves (never rejects).
 */
export async function notifyN8nWebhook(
  webhookUrl: string | undefined,
  payload: N8nWebhookPayload
): Promise<void> {
  if (!webhookUrl) {
  console.warn('[n8n Webhook] Skipped: URL is not configured');
  return;
}

console.log('[n8n Webhook] Sending POST request');



  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[n8n Webhook] Delivery failed: non-2xx response');
      return;
    }

    console.log('[n8n Webhook] HTTP status:', response.status);

  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[n8n Webhook] Delivery failed: request timed out');
    } else {
      console.warn('[n8n Webhook] Delivery failed: network error');
    }
    console.warn('[n8n Webhook] Request error:', err.message);
    return;
  } finally {
    clearTimeout(timeoutId);
  }
}