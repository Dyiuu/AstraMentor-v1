import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Graph } from '@antv/g6';
import type { GraphData } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface KnowledgeGraphProps {
  data: GraphData | null;
  onNodeClick: (nodeId: string, nodeName: string, attributes: any) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: any) => void;
  theme?: 'light' | 'eye-care' | 'dark';
}

/**
 * 将掌握度权重映射到精致的渐变色系
 * 使用蓝→青→绿渐变表示从未学到已掌握的进度
 */
const getMasteryColor = (weightA: number): { fill: string; stroke: string; shadowColor: string } => {
  if (weightA >= 0.8) return { fill: '#059669', stroke: '#047857', shadowColor: 'rgba(5,150,105,0.4)' };
  if (weightA >= 0.6) return { fill: '#10b981', stroke: '#059669', shadowColor: 'rgba(16,185,129,0.35)' };
  if (weightA >= 0.4) return { fill: '#14b8a6', stroke: '#0d9488', shadowColor: 'rgba(20,184,166,0.3)' };
  if (weightA >= 0.2) return { fill: '#3b82f6', stroke: '#2563eb', shadowColor: 'rgba(59,130,246,0.3)' };
  // 未开始学习：优雅的靛蓝色
  return { fill: '#6366f1', stroke: '#4f46e5', shadowColor: 'rgba(99,102,241,0.3)' };
};

/**
 * 根据边的权重返回视觉参数
 * 使用柔和的灰蓝色系，避免喧宾夺主
 */
const getEdgeStyle = (weight: number) => {
  // NOTE: 用靖蓝→紫色色调体现关联强度
  // 弱连接浅蓝透明，强连接深紫饱和
  if (weight >= 0.8) return { stroke: '#6366f1', lineWidth: 2.5 };
  if (weight >= 0.6) return { stroke: '#818cf8', lineWidth: 2.2 };
  if (weight >= 0.4) return { stroke: '#a5b4fc', lineWidth: 1.8 };
  if (weight >= 0.2) return { stroke: '#c7d2fe', lineWidth: 1.5 };
  return { stroke: '#ddd6fe', lineWidth: 1.2 };
};

/**
 * 根据主题获取配色方案
 */
const getThemeColors = (theme?: string) => {
  if (theme === 'eye-care') {
    return {
      canvasBg: '#faf7f2',
      defaultFill: '#6366f1',
      defaultStroke: '#4f46e5',
      edgeColor: 'rgba(120, 113, 108, 0.3)',
      shadowColor: 'rgba(99,102,241,0.3)',
    };
  }
  return {
    canvasBg: '#f8fafc',
    defaultFill: '#6366f1',
    defaultStroke: '#4f46e5',
    edgeColor: 'rgba(99, 102, 241, 0.25)',
    shadowColor: 'rgba(99,102,241,0.3)',
  };
};

/**
 * 对指定 Graph 实例应用节点高亮
 * NOTE: 通过修改数据中的 _dimmed 标记 + draw() 重绘来实现
 * 这种数据驱动方式不依赖 G6 的 state 系统，最可靠
 */
const applyHighlight = (graph: Graph, nodeId: string) => {
  try {
    const allEdges = graph.getEdgeData();
    const allNodes = graph.getNodeData();

    const connectedNodeIds = new Set<string>([nodeId]);
    const connectedEdgeIds = new Set<string>();

    allEdges.forEach((edge: any) => {
      if (edge.source === nodeId || edge.target === nodeId) {
        connectedEdgeIds.add(edge.id as string);
        connectedNodeIds.add(edge.source as string);
        connectedNodeIds.add(edge.target as string);
      }
    });

    // 更新每个节点的 _dimmed 标记
    allNodes.forEach((n: any) => {
      graph.updateNodeData([{
        id: n.id,
        data: { ...n.data, _dimmed: !connectedNodeIds.has(n.id as string), _selected: n.id === nodeId },
      }]);
    });
    allEdges.forEach((e: any) => {
      graph.updateEdgeData([{
        id: e.id,
        source: e.source,
        target: e.target,
        data: { ...e.data, _dimmed: !connectedEdgeIds.has(e.id as string), _highlighted: connectedEdgeIds.has(e.id as string) },
      }]);
    });

    graph.draw();
  } catch (err) {
    console.warn('[KnowledgeGraph] applyHighlight error:', err);
  }
};

/**
 * 清除高亮，移除所有 _dimmed/_selected 标记
 */
const clearHighlight = (graph: Graph) => {
  try {
    const allNodes = graph.getNodeData();
    const allEdges = graph.getEdgeData();
    allNodes.forEach((n: any) => {
      graph.updateNodeData([{
        id: n.id,
        data: { ...n.data, _dimmed: false, _selected: false },
      }]);
    });
    allEdges.forEach((e: any) => {
      graph.updateEdgeData([{
        id: e.id,
        source: e.source,
        target: e.target,
        data: { ...e.data, _dimmed: false, _highlighted: false },
      }]);
    });
    graph.draw();
  } catch (err) {
    console.warn('[KnowledgeGraph] clearHighlight error:', err);
  }
};

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ data, onNodeClick, onNodeContextMenu, theme }) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  // NOTE: 保存当前高亮的节点 ID，在图表重渲染后恢复高亮状态
  const highlightedNodeRef = useRef<string | null>(null);
  const [layoutType, setLayoutType] = useState<'TB' | 'LR'>('TB');
  const [selectedEdgeInfo, setSelectedEdgeInfo] = useState<{
    id: string;
    label: string;
    weight: number;
    x: number;
    y: number;
  } | null>(null);

  // NOTE: 保存回调引用，避免 Graph 事件处理闭包捕获旧值
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeContextMenuRef = useRef(onNodeContextMenu);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { onNodeContextMenuRef.current = onNodeContextMenu; }, [onNodeContextMenu]);

  /**
   * 将 GraphData 转换为 G6 需要的数据格式
   * 同时计算每个节点和边的视觉样式参数
   */
  const transformData = useCallback((graphData: GraphData) => {
    const themeColors = getThemeColors(theme);

    // NOTE: 所有业务属性放入 _attrs，样式信息用下划线前缀
    // 避免 dagre 布局算法误读 weight 等字段
    const nodes = graphData.nodes.map((n) => {
      const weightA = n.attributes?.weight_A ?? 0;
      const mastery = weightA > 0
        ? getMasteryColor(weightA)
        : { fill: themeColors.defaultFill, stroke: themeColors.defaultStroke, shadowColor: themeColors.shadowColor };

      return {
        id: n.id,
        data: {
          label: n.name,
          _fill: mastery.fill,
          _stroke: mastery.stroke,
          _shadowColor: mastery.shadowColor,
          _weightA: weightA,
          _attrs: n.attributes || {},
        },
      };
    });

    const edges = graphData.links.map((e, index) => {
      const w = e.weight || 0.1;
      const edgeStyle = getEdgeStyle(w);
      return {
        id: `edge-${index}`,
        source: e.source,
        target: e.target,
        data: {
          _weight: w,
          _reason: e.reason,
          _stroke: edgeStyle.stroke,
          _lineWidth: edgeStyle.lineWidth,
        },
      };
    });

    return { nodes, edges };
  }, [theme]);

  /**
   * 布局配置：大间距 + 控制点让图谱清晰通透
   */
  const getLayoutConfig = useCallback((type: 'TB' | 'LR') => ({
    type: 'antv-dagre' as const,
    rankdir: type,
    nodeSize: [200, 50] as [number, number],
    nodesep: type === 'TB' ? 120 : 90,
    ranksep: type === 'TB' ? 100 : 120,
    controlPoints: true,
  }), []);

  // NOTE: 主要的 Graph 初始化与更新 effect
  useEffect(() => {
    if (!containerRef.current || !data) {
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
      return;
    }

    const g6Data = transformData(data);
    const themeColors = getThemeColors(theme);

    // 如果图表已存在，只更新数据
    if (graphRef.current) {
      graphRef.current.setData(g6Data);
      graphRef.current.setLayout(getLayoutConfig(layoutType));
      graphRef.current.render().then(() => {
        // NOTE: 重渲染后恢复之前的高亮状态
        if (highlightedNodeRef.current && graphRef.current) {
          applyHighlight(graphRef.current, highlightedNodeRef.current);
        }
      }).catch((err: Error) => {
        console.error('Graph re-render error:', err);
      });
      return;
    }

    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout>;
    let graphInstance: Graph | null = null;

    const createGraph = () => {
      if (!mounted || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        retryTimer = setTimeout(createGraph, 100);
        return;
      }

      const graph = new Graph({
        container: containerRef.current,
        width: rect.width,
        height: rect.height,
        autoFit: 'view',
        padding: [40, 40, 40, 40],
        data: g6Data,
        layout: getLayoutConfig(layoutType),
        edge: {
          // NOTE: cubic-vertical 的特性完美匹配需求
          // 上下对齐的节点 → 自动变直线；有水平偏移 → 优雅 S 曲线
          type: 'cubic-vertical',
          style: {
            stroke: (d: any) => {
              if (d.data?._highlighted) return '#6366f1';
              if (d.data?._dimmed) return '#e2e8f0';
              return d.data?._stroke || themeColors.edgeColor;
            },
            lineWidth: (d: any) => {
              if (d.data?._highlighted) return 3;
              if (d.data?._dimmed) return 0.8;
              return d.data?._lineWidth || 1.5;
            },
            opacity: (d: any) => d.data?._dimmed ? 0.2 : 1,
            endArrow: true,
            endArrowSize: (d: any) => d.data?._highlighted ? 10 : 8,
            endArrowFill: (d: any) => {
              if (d.data?._highlighted) return '#6366f1';
              if (d.data?._dimmed) return '#e2e8f0';
              return d.data?._stroke || themeColors.edgeColor;
            },
            cursor: 'pointer',
          },
        },
        node: {
          type: 'rect',
          style: {
            size: [220, 52],
            radius: 12,
            labelText: (d: any) => d.data?.label || d.id || '',
            labelPlacement: 'center',
            labelFontSize: 17,
            labelFontWeight: 600,
            labelFill: '#fff',
            labelFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            labelWordWrap: true,
            labelWordWrapWidth: 190,
            labelMaxLines: 2,
            fill: (d: any) => d.data?._fill || themeColors.defaultFill,
            stroke: (d: any) => {
              if (d.data?._selected) return '#fff';
              return d.data?._stroke || themeColors.defaultStroke;
            },
            lineWidth: (d: any) => d.data?._selected ? 3 : 1.5,
            opacity: (d: any) => d.data?._dimmed ? 0.2 : 1,
            shadowColor: (d: any) => d.data?._shadowColor || themeColors.shadowColor,
            shadowBlur: (d: any) => d.data?._selected ? 24 : 12,
            shadowOffsetX: 0,
            shadowOffsetY: 4,
            cursor: 'pointer',
          },
        },
        behaviors: ['drag-element', 'drag-canvas', 'zoom-canvas'],
      });

      graphInstance = graph;

      // 节点点击事件：高亮关联边 + 触发学习流程
      graph.on('node:click', (evt: any) => {
        const nodeData = graph.getNodeData(evt.target.id);
        if (nodeData) {
          const nodeId = nodeData.id as string;
          highlightedNodeRef.current = nodeId;
          applyHighlight(graph, nodeId);
          const d = nodeData.data as any;
          onNodeClickRef.current(
            nodeId,
            d?.label || nodeId,
            d?._attrs || {}
          );
        }
      });

      // 节点右键事件：弹出详情弹窗
      graph.on('node:contextmenu', (evt: any) => {
        const nodeData = graph.getNodeData(evt.target.id);
        if (nodeData && onNodeContextMenuRef.current) {
          const syntheticEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX: evt.client?.x || 0,
            clientY: evt.client?.y || 0,
          } as unknown as React.MouseEvent;

          const d = nodeData.data as any;
          const compatNode = {
            id: nodeData.id,
            data: {
              label: d?.label || nodeData.id,
              ...(d?._attrs || {}),
            },
          };
          onNodeContextMenuRef.current(syntheticEvent, compatNode);
        }
      });

      // 边点击事件：显示关系详情弹窗
      graph.on('edge:click', (evt: any) => {
        const edgeData = graph.getEdgeData(evt.target.id);
        if (edgeData) {
          const d = edgeData.data as any;
          setSelectedEdgeInfo({
            id: edgeData.id as string,
            label: d?._reason || '',
            weight: d?._weight || 0,
            x: evt.client?.x || 0,
            y: evt.client?.y || 0,
          });
        }
      });

      // 点击画布空白区域：重置高亮 + 关闭弹窗
      graph.on('canvas:click', () => {
        highlightedNodeRef.current = null;
        clearHighlight(graph);
        setSelectedEdgeInfo(null);
      });

      graph.render().then(() => {
        if (mounted) {
          graphRef.current = graph;
        }
      }).catch((err: Error) => {
        console.error('[KnowledgeGraph] Graph render error:', err);
      });
    };

    createGraph();

    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      if (graphInstance) {
        graphInstance.destroy();
      }
      graphRef.current = null;
    };
  }, [data, theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // NOTE: 单独的 ResizeObserver，仅用于调整已存在图表的尺寸
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && graphRef.current) {
          graphRef.current.resize(width, height);
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  /**
   * 布局切换处理
   */
  const handleLayoutChange = useCallback(async (type: 'TB' | 'LR') => {
    setLayoutType(type);
    if (graphRef.current) {
      graphRef.current.setLayout(getLayoutConfig(type));
      await graphRef.current.layout();
      graphRef.current.fitCenter();
    }
  }, [getLayoutConfig]);

  const handleOuterClick = useCallback(() => {
    setSelectedEdgeInfo(null);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }} onClick={handleOuterClick}>
      {/* 布局切换按钮 - 精致的胶囊按钮 */}
      {data && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            display: 'flex',
            gap: 2,
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(8px)',
            borderRadius: 12,
            padding: 3,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {(['TB', 'LR'] as const).map((type) => (
            <button
              key={type}
              onClick={(e) => { e.stopPropagation(); handleLayoutChange(type); }}
              style={{
                padding: '7px 16px',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.2s ease',
                background: layoutType === type
                  ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                  : 'transparent',
                color: layoutType === type ? '#fff' : '#64748b',
                boxShadow: layoutType === type
                  ? '0 2px 8px rgba(99,102,241,0.3)'
                  : 'none',
              }}
            >
              {type === 'TB' ? '↓ 纵向' : '→ 横向'}
            </button>
          ))}
        </div>
      )}

      {/* G6 画布容器 */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* 边关系详情弹窗 - 精致的浮动卡片 */}
      {selectedEdgeInfo && (
        <div
          style={{
            position: 'fixed',
            left: selectedEdgeInfo.x,
            top: selectedEdgeInfo.y,
            transform: 'translate(-50%, -100%)',
            marginTop: '-12px',
            minWidth: '220px',
            maxWidth: '320px',
            padding: '16px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            border: '1px solid rgba(0,0,0,0.06)',
            zIndex: 50,
            animation: 'fadeInUp 0.2s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#6366f1',
            marginBottom: 8,
          }}>
            {t('graph.relation_info')}
          </div>
          <div style={{
            fontSize: 13,
            color: '#334155',
            lineHeight: 1.5,
            marginBottom: 12,
          }}>
            {selectedEdgeInfo.label}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
              {t('graph.relation_strength')}
            </span>
            <div style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: '#e2e8f0',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${selectedEdgeInfo.weight * 100}%`,
                borderRadius: 2,
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#6366f1',
              minWidth: 36,
              textAlign: 'right',
            }}>
              {Math.round(selectedEdgeInfo.weight * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* 内联动画关键帧 */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translate(-50%, -100%) translateY(8px); }
          to { opacity: 1; transform: translate(-50%, -100%) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default KnowledgeGraph;
