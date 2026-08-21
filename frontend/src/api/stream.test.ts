import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, getCourseIndexNotReadyDetail } from './errors';
import { streamLearning } from './stream';

afterEach(() => vi.unstubAllGlobals());

describe('streamLearning errors', () => {
  it('parses FastAPI JSON errors before reading an SSE body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: {
        code: 'course_index_not_ready',
        course_id: 'rag-knowledge-engineering',
        status: 'building',
        message: '索引正在构建',
      },
    }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })));

    let captured: unknown;
    try {
      await streamLearning('/learning/chat/stream', {}, () => undefined);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(ApiRequestError);
    expect(getCourseIndexNotReadyDetail(captured)).toMatchObject({
      course_id: 'rag-knowledge-engineering',
      status: 'building',
    });
  });

  it('keeps a text 500 response readable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gateway failed', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    })));

    await expect(streamLearning('/learning/chat/stream', {}, () => undefined))
      .rejects.toThrow('gateway failed');
  });

  it('decodes JSON SSE frames', async () => {
    const frames = 'event: content_delta\ndata: {"text":"你好"}\n\nevent: done\ndata: {}\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(frames, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })));
    const received: string[] = [];

    await streamLearning('/learning/chat/stream', {}, ({ event }) => received.push(event));

    expect(received).toEqual(['content_delta', 'done']);
  });
});
