import { API_BASE_URL } from './client';
import { ApiRequestError } from './errors';

export type StreamEventName =
  | 'meta'
  | 'content_delta'
  | 'reasoning_delta'
  | 'warning'
  | 'citations'
  | 'sources'
  | 'done'
  | 'error';

export interface StreamEvent {
  event: StreamEventName;
  data: Record<string, unknown>;
}

/** Read JSON SSE frames without relying on EventSource (which cannot POST). */
export async function streamLearning(
  endpoint: string,
  body: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const rawPayload = await response.text();
    let payload: unknown = rawPayload;
    if (contentType.includes('application/json')) {
      try {
        payload = JSON.parse(rawPayload) as unknown;
      } catch {
        payload = rawPayload;
      }
    }
    throw new ApiRequestError(response.status, payload, `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('浏览器没有收到流式响应体');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeFrame = (frame: string) => {
    let event: StreamEventName = 'content_delta';
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim() as StreamEventName;
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    onEvent({ event, data });
    if (event === 'error') throw new Error(String(data.message || '流式请求失败'));
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    for (const frame of frames) consumeFrame(frame);
    if (done) break;
  }
  if (buffer.trim()) consumeFrame(buffer);
}
