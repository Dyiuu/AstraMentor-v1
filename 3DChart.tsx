import { CameraSetting, ExtensionCategory, Graph, register } from '@antv/g6';
import { D3Force3DLayout, Light, Line3D, ObserveCanvas3D, Sphere, ZoomCanvas3D, renderer } from '@antv/g6-extension-3d';
import { useEffect, useRef } from 'react';

// 注册3D扩展
register(ExtensionCategory.PLUGIN, '3d-light', Light);
register(ExtensionCategory.NODE, 'sphere', Sphere);
register(ExtensionCategory.EDGE, 'line3d', Line3D);
register(ExtensionCategory.LAYOUT, 'd3-force-3d', D3Force3DLayout);
register(ExtensionCategory.PLUGIN, 'camera-setting', CameraSetting);
register(ExtensionCategory.BEHAVIOR, 'zoom-canvas-3d', ZoomCanvas3D);
register(ExtensionCategory.BEHAVIOR, 'observe-canvas-3d', ObserveCanvas3D);

export default () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<Graph>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const data = {
            nodes: Array.from({ length: 10 }, (_, i) => ({
                id: `node-${i}`,
                data: { value: i + 1 },
                style: {
                    x: Math.random() * 400,
                    y: Math.random() * 100,
                    z: Math.random() * 10000
                }
            })),
            edges: Array.from({ length: 9 }, (_, i) => ({
                id: `edge-${i}`,
                source: `node-${Math.floor(i / 3)}`,
                target: `node-${i + 1}`
            }))
        };

        const graph = new Graph({
            container: containerRef.current,
            renderer,
            width: 800,
            height: 600,
            data,
            layout: {
                type: 'd3-force-3d',
                link: {
                    distance: 60,
                },
            },
            node: {
                type: 'sphere',
                style: {
                    materialType: 'phong',
                },
                palette: {
                    color: 'tableau',
                    type: 'group',
                    field: 'group',
                },
            },
            edge: {
                type: 'line3d',
            },
            behaviors: ['observe-canvas-3d', 'zoom-canvas-3d'],
            plugins: [
                {
                    type: '3d-light',
                    directional: {
                        direction: [0, 0, 1],
                    },
                },
            ],
        });
        graphRef.current = graph;

        // 清理函数
        return () => {
            const graph = graphRef.current;
            if (graph) {
                graph.destroy();
                graphRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        let timeoutId = setTimeout(() => {
            const graph = graphRef.current;
            if (!graph) return;
            graph.render();

            setInterval(
                () => {
                    const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
                    graph.updateNodeData([
                        {
                            id: 'node-1',
                            style: {
                                fill: randomColor,
                            },
                        },
                    ]);
                    graph.updateEdgeData([
                        {
                            id: 'edge-1',
                            style: {
                                stroke: randomColor,
                            },
                        },
                    ]);
                    graph.draw();
                }, 2000
            )
        }, 0);
        return () => {
            clearTimeout(timeoutId);
        }
    }, [graphRef]);

    return (
        <div className="w-full h-full flex flex-col items-center">
            <div className="text-slate-700 dark:text-slate-300 mb-4">
                <h2 className="text-2xl font-bold mb-2">3D Force-Directed Graph</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    使用鼠标拖拽旋转视角，滚轮缩放
                </p>
            </div>
            <div
                ref={containerRef}
                className="border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg bg-white dark:bg-slate-800"
                style={{ width: '800px', height: '600px' }}
            />
        </div>
    );
};
