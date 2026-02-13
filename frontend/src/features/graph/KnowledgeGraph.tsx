import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  Position,
  Handle,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import type { GraphData } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

// Custom Node with handles on all 4 sides
const MultiHandleNode = ({ data, isConnectable }: NodeProps) => {
  return (
    <div style={{ 
        background: data.background || '#fff', 
        border: '1px solid #777', 
        borderRadius: '8px', 
        width: 172, 
        padding: '8px', 
        textAlign: 'center', 
        fontSize: '12px',
        position: 'relative'
    }}>
      <Handle type="target" position={Position.Top} id="top" isConnectable={isConnectable} style={{ background: '#555' }} />
      <Handle type="target" position={Position.Left} id="left" isConnectable={isConnectable} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} id="right" isConnectable={isConnectable} style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={isConnectable} style={{ background: '#555' }} />
      
      {/* We allow incoming/outgoing on all sides ideally, but ReactFlow handles are typed 'source' | 'target'.
          To fully support omni-directional, we might need 4 source and 4 target handles, or just relaxed rules.
          For this specific DAG visualization (Learning Path), usually flow is Top-Left to Bottom-Right.
          Let's stick to: Input: Top/Left, Output: Bottom/Right for creating a "Flow" feel.
      */}
      <div>{data.label}</div>
    </div>
  );
};

const nodeTypes = {
  custom: MultiHandleNode,
};

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80, 
    ranksep: 120, // Reduced slightly to keep it compact with side-connections
    ranker: 'network-simplex', 
    marginx: 50,
    marginy: 50
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
    return node;
  });

  // Calculate dynamic handles for edges
  const layoutedEdges = edges.map((edge) => {
      const sourceNode = layoutedNodes.find(n => n.id === edge.source);
      const targetNode = layoutedNodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) return edge;

      const sx = sourceNode.position.x + nodeWidth / 2;
      const sy = sourceNode.position.y + nodeHeight / 2;
      const tx = targetNode.position.x + nodeWidth / 2;
      const ty = targetNode.position.y + nodeHeight / 2;

      const dx = Math.abs(tx - sx);
      const dy = Math.abs(ty - sy);

      // Simple heuristic: 
      // If horizontal distance is significantly larger than vertical, prefer side connection.
      // Since layouts are TB, dy is usually positive.
      
      let sourceHandle = 'bottom';
      let targetHandle = 'top';

      if (dx > dy * 0.8) { 
          // Similar horizontal and vertical, or distinct horizontal alignment.
          // If target is to the right
          if (tx > sx) {
              sourceHandle = 'right';
              targetHandle = 'left'; // Or Top? 'left' makes a straight line
          } else {
              // Target is to the left? Usually rare in specific DAG configs but possible
             // sourceHandle = 'left'; // But we defined Left as Target handle above...
             // Let's rely on Bottom->Top for backwards flow (cycles), or if we add Source:Left?
             // Simplification: We only added Source:Right and Target:Left above.
             // If tx < sx, we keep Bottom->Top or Bottom->Left?
             targetHandle = 'top';
          }
      } 
      
      // If they are strictly vertical (dx is small), keep Bottom->Top
      
      return {
          ...edge,
          sourceHandle,
          targetHandle
      };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
};

const isHorizontal = false;

interface KnowledgeGraphProps {
  data: GraphData | null;
  onNodeClick: (nodeId: string, nodeName: string, attributes: any) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: any) => void;
  theme?: 'light' | 'eye-care' | 'dark';
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ data, onNodeClick, onNodeContextMenu, theme }) => {
  const { t } = useLanguage();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEdgeInfo, setSelectedEdgeInfo] = React.useState<{ id: string; label: string; weight: number; x: number; y: number } | null>(null);

  const onPaneClick = useCallback(() => {
     setSelectedEdgeInfo(null);
     setEdges((edges) => 
        edges.map((e) => ({
            ...e,
            label: '',
            zIndex: 0,
            style: e.data.originalStyle
        }))
     );
  }, [setEdges]);

  useEffect(() => {
    if (!data) {
        setNodes([]);
        setEdges([]);
        return;
    }

    // Transform GraphData to ReactFlow Nodes/Edges
    const initialNodes: Node[] = data.nodes.map((n) => ({
      id: n.id,
      type: 'custom', // Use custom node
      position: { x: 0, y: 0 }, 
      data: { 
          label: n.name,
          background: (n.attributes?.weight_A ?? 0) >= 0.8 ? '#dcfce7' : '#fff',
          ...n.attributes 
      },
    }));

    const initialEdges: Edge[] = data.links.map((e, index) => {
      const weight = e.weight || 0.1;
      
      const getGradientColor = (w: number) => {
          if (w >= 0.9) return '#172554'; 
          if (w >= 0.8) return '#1e3a8a'; 
          if (w >= 0.7) return '#1e40af'; 
          if (w >= 0.6) return '#1d4ed8'; 
          if (w >= 0.5) return '#2563eb'; 
          if (w >= 0.4) return '#3b82f6'; 
          if (w >= 0.3) return '#60a5fa'; 
          if (w >= 0.2) return '#93c5fd'; 
          return '#bfdbfe'; 
      };

      const strokeColor = getGradientColor(weight);
      const strokeWidth = 1 + (weight * 3); 
      const opacity = 0.6 + (weight * 0.4); 
      const strokeDasharray = '5,5'; 

      return {
        id: `e${index}`,
        source: e.source,
        target: e.target,
        label: '', 
        data: {
          originalLabel: e.reason,
          weight: weight,
          originalStyle: {
              stroke: strokeColor,
              strokeWidth: strokeWidth,
              opacity: opacity,
              strokeDasharray: strokeDasharray
          }
        },
        type: 'smoothstep',
        animated: weight >= 0.8,
        style: {
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            opacity: opacity,
            strokeDasharray: strokeDasharray
        },
        interactionWidth: 20, 
      };
    });

    const layouted = getLayoutedElements(initialNodes, initialEdges);
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [data, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );
  
  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
      onNodeClick(node.id, node.data.label, node.data);
  };

  const onEdgeClick = (event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    
    // Highlight edge
    setEdges((edges) =>
      edges.map((e) => {
        if (e.id === edge.id) {
          return {
            ...e,
            zIndex: 10,
            style: {
                ...e.data.originalStyle, 
                stroke: '#f59e0b', // Orange when selected
                strokeWidth: 3,
                opacity: 1 
            }
          };
        }
        // Reset others
        return {
            ...e,
            zIndex: 0,
            style: e.data.originalStyle
        };
      })
    );

    // Show Popup
    setSelectedEdgeInfo({
        id: edge.id,
        label: edge.data?.originalLabel,
        weight: edge.data?.weight,
        x: event.clientX,
        y: event.clientY
    });
  };

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault(); // Prevent native browser context menu
      if (onNodeContextMenu) {
         onNodeContextMenu(event, node);
      }
    },
    [onNodeContextMenu]
  );
  
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background 
            variant={BackgroundVariant.Dots} 
            gap={12} 
            size={1} 
            color={theme === 'eye-care' ? '#d6d3d1' : '#94a3b8'}
        />
      </ReactFlow>

      {/* Edge Info Popup */}
      {selectedEdgeInfo && (
        <div 
            className="fixed z-50 p-4 rounded-lg shadow-lg border bg-popover text-popover-foreground animate-in fade-in zoom-in-95"
            style={{ 
                left: selectedEdgeInfo.x, 
                top: selectedEdgeInfo.y,
                transform: 'translate(-50%, -100%)', 
                marginTop: '-16px',
                minWidth: '200px'
            }}
        >
            <div className="font-semibold mb-2 text-sm">{t('graph.relation_info')}</div>
            <div className="text-sm mb-3">{selectedEdgeInfo.label}</div>
            
            <div className="flex items-center gap-2 text-xs opacity-80">
                <span>{t('graph.relation_strength')}:</span>
                <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-primary" 
                        style={{ width: `${selectedEdgeInfo.weight * 100}%` }}
                    />
                </div>
                <span>{selectedEdgeInfo.weight}</span>
            </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeGraph;
