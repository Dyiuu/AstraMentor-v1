import { describe, expect, it, vi } from 'vitest';
import { api, client } from './client';

describe('course-scoped graph requests', () => {
  it('sends course_id and the supplied current level when generating', async () => {
    const post = vi.spyOn(client, 'post').mockResolvedValue({ data: { nodes: [], links: [] } });

    await api.generateGraph(
      'Agent 开发工程师',
      '完成岗位项目',
      '已具备：Python、HTTP/JSON',
      '完成课程',
      2,
      'agent-engineering',
    );

    expect(post).toHaveBeenCalledWith('/graph/generate', expect.objectContaining({
      current_level: '已具备：Python、HTTP/JSON',
      course_id: 'agent-engineering',
    }));
  });

  it('keeps course_id on graph expansion', async () => {
    const graph = { nodes: [], links: [] };
    const post = vi.spyOn(client, 'post').mockResolvedValue({ data: graph });

    await api.expandGraph('课程', '新节点', 0, 0.8, '', graph, 'agent-engineering');

    expect(post).toHaveBeenCalledWith('/graph/expand', expect.objectContaining({
      course_id: 'agent-engineering',
    }));
  });

  it('includes course_id when deleting a scoped graph', async () => {
    const remove = vi.spyOn(client, 'delete').mockResolvedValue({ data: { status: 'ok' } });

    await api.deleteGraph('课程', 'agent-engineering');

    expect(remove).toHaveBeenCalledWith('/graph/delete', {
      params: { topic: '课程', course_id: 'agent-engineering' },
    });
  });
});
