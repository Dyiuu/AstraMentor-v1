import { Graph } from '@antv/g6';
import { useEffect, useRef, useState } from 'react';

export default function DAGChart() {
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<Graph | null>(null);
    const [layoutType, setLayoutType] = useState<'default' | 'LR' | 'LR&UL'>('default');

    const data = {
        nodes: [
            { id: '0', data: { label: 'Start' } },
            { id: '1', data: { label: 'Task 1' } },
            { id: '2', data: { label: 'Task 2' } },
            { id: '3', data: { label: 'Task 3' } },
            { id: '4', data: { label: 'Process' } },
            { id: '5', data: { label: 'Review' } },
            { id: '6', data: { label: 'Test' } },
            { id: '7', data: { label: 'Deploy A' } },
            { id: '8', data: { label: 'Deploy B' } },
            { id: '9', data: { label: 'Complete' } },
        ],
        edges: [
            { id: 'edge-0-1', source: '0', target: '1' },
            { id: 'edge-0-2', source: '0', target: '2' },
            { id: 'edge-1-4', source: '1', target: '4' },
            { id: 'edge-0-3', source: '0', target: '3' },
            { id: 'edge-3-4', source: '3', target: '4' },
            { id: 'edge-4-5', source: '4', target: '5' },
            { id: 'edge-4-6', source: '4', target: '6' },
            { id: 'edge-5-7', source: '5', target: '7' },
            { id: 'edge-5-8', source: '5', target: '8' },
            { id: 'edge-8-9', source: '8', target: '9' },
            { id: 'edge-2-9', source: '2', target: '9' },
            { id: 'edge-3-9', source: '3', target: '9' },
        ],
    };

    const layouts = {
        default: { 
            type: 'antv-dagre', 
            nodeSize: [80, 40],
            nodesep: 80, 
            ranksep: 60, 
            controlPoints: true 
        },
        LR: { 
            type: 'antv-dagre', 
            rankdir: 'LR', 
            align: 'DL', 
            nodeSize: [80, 40],
            nodesep: 60, 
            ranksep: 80, 
            controlPoints: true 
        },
        'LR&UL': { 
            type: 'antv-dagre', 
            rankdir: 'LR', 
            align: 'UL', 
            nodeSize: [80, 40],
            controlPoints: true, 
            nodesep: 60, 
            ranksep: 80 
        },
    };

    useEffect(() => {
        if (!containerRef.current) return;

        let mounted = true;
        const graph = new Graph({
            container: containerRef.current,
            width: 900,
            height: 600,
            autoFit: 'view',
            data,
            layout: layouts[layoutType],
            node: {
                type: 'rect',
                style: {
                    size: [80, 40],
                    radius: 8,
                    labelText: (d: any) => d.data?.label || d.id,
                    labelFontSize: 12,
                    labelFill: '#fff',
                    fill: '#5B8FF9',
                    stroke: '#2E5EA8',
                    lineWidth: 2,
                },
            },
            edge: {
                type: 'polyline',
                style: {
                    stroke: '#99ADD1',
                    lineWidth: 2,
                    endArrow: true,
                },
            },
            behaviors: ['drag-element', 'drag-canvas', 'zoom-canvas'],
        });

        graph.render().then(() => {
            if (mounted) {
                graphRef.current = graph;
            }
        }).catch((err) => {
            console.error('Graph render error:', err);
        });

        return () => {
            mounted = false;
            graphRef.current = null;
            graph.destroy();
        };
    }, [layoutType]);

    const handleLayoutChange = async (type: 'default' | 'LR' | 'LR&UL') => {
        setLayoutType(type);
        if (graphRef.current) {
            graphRef.current.setLayout(layouts[type]);
            await graphRef.current.layout();
            graphRef.current.fitCenter();
        }
    };

    return (
        <div className="w-full flex flex-col items-center gap-4">
            <div className="text-slate-700 dark:text-slate-300">
                <h2 className="text-2xl font-bold mb-2">DAG - 有向无环图</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    支持拖拽节点、画布缩放和多种布局方式
                </p>
                
                {/* 布局切换按钮 */}
                <div className="flex gap-2 justify-center mb-4">
                    <button
                        onClick={() => handleLayoutChange('default')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            layoutType === 'default'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                    >
                        默认布局 (TB)
                    </button>
                    <button
                        onClick={() => handleLayoutChange('LR')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            layoutType === 'LR'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                    >
                        左右布局 (LR-DL)
                    </button>
                    <button
                        onClick={() => handleLayoutChange('LR&UL')}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            layoutType === 'LR&UL'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                        }`}
                    >
                        左右布局 (LR-UL)
                    </button>
                </div>
            </div>
            
            <div 
                ref={containerRef} 
                className="border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg bg-white dark:bg-slate-800"
                style={{ width: '900px', height: '600px' }}
            />
        </div>
    );
}
