import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import type { LearnerState } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

import type { GraphData } from '../../types';

interface DashboardProps {
  state: LearnerState | null;
  graphData?: GraphData | null;
  viewMode?: '2d' | '3d';
}

const Dashboard: React.FC<DashboardProps> = ({ state, graphData, viewMode }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = React.useState(true);
  
  // Logic: 
  // If graphData is present, show stats for the CURRENT GRAPH (Total nodes, etc.)
  // If no graphData, show global learner state.
  
  // Actually, user wants data to match the generated star chart.
  // So if graphData exists, we prioritize it.
  
  const displayState = React.useMemo(() => {
    if (graphData && graphData.nodes.length > 0) {
        const total = graphData.nodes.length;
        
        // Mastered: Current Mastery (A) >= Target Mastery (B, default 0.8)
        const mastered = graphData.nodes.filter(n => {
            const current = parseFloat(String(n.attributes.weight_A || 0));
            const target = parseFloat(String(n.attributes.weight_B || 0.8));
            return current >= target;
        }).length;

        // Average: Simple average of Current Mastery
        const average = total > 0 
            ? graphData.nodes.reduce((acc, n) => acc + parseFloat(String(n.attributes.weight_A || 0)), 0) / total 
            : 0;
            
        return {
            total,
            mastered,
            average_mastery: average
        };
    }
    return state;
  }, [state, graphData]);

  if (!displayState) return null;

  const is3D = viewMode === '3d';

  return (
    <div className="dashboard-shell flex flex-col gap-2 mb-4 pointer-events-auto">
      <div className="flex items-center">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-all ${
            is3D 
              ? 'text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10'
              : 'text-slate-500 hover:text-slate-700 bg-white/50 hover:bg-white/80 backdrop-blur-sm'
          }`}
        >
          {isOpen ? t('dashboard.collapse') : t('dashboard.expand')}
        </button>
      </div>
      
      {isOpen && (
        <div className="dashboard-stats animate-in fade-in slide-in-from-top-2 duration-300">
          <Card className={`dashboard-stat backdrop-blur-md shadow-sm transition-colors ${
            is3D 
              ? 'bg-white/10 border-white/10 hover:bg-white/20' 
              : 'bg-white/80 border-white/20 hover:bg-white/90'
          }`}>
            <CardContent className="dashboard-stat__content p-4 flex flex-col items-center justify-center">
              <div className={`text-xs font-medium mb-1 ${is3D ? 'text-slate-300' : 'text-muted-foreground'}`}>{t('dashboard.total')}</div>
              <div className={`text-2xl font-bold ${is3D ? 'text-slate-100' : ''}`}>{displayState.total}</div>
            </CardContent>
          </Card>
          <Card className={`dashboard-stat backdrop-blur-md shadow-sm transition-colors ${
            is3D 
              ? 'bg-white/10 border-white/10 hover:bg-white/20' 
              : 'bg-white/80 border-white/20 hover:bg-white/90'
          }`}>
            <CardContent className="dashboard-stat__content p-4 flex flex-col items-center justify-center">
                <div className={`text-xs font-medium mb-1 ${is3D ? 'text-slate-300' : 'text-muted-foreground'}`}>{t('dashboard.mastered')}</div>
                <div className={`text-2xl font-bold ${is3D ? 'text-emerald-400' : 'text-green-600'}`}>{displayState.mastered}</div>
            </CardContent>
          </Card>
          <Card className={`dashboard-stat backdrop-blur-md shadow-sm transition-colors ${
            is3D 
              ? 'bg-white/10 border-white/10 hover:bg-white/20' 
              : 'bg-white/80 border-white/20 hover:bg-white/90'
          }`}>
            <CardContent className="dashboard-stat__content p-4 flex flex-col items-center justify-center">
                <div className={`text-xs font-medium mb-1 ${is3D ? 'text-slate-300' : 'text-muted-foreground'}`}>{t('dashboard.average_mastery')}</div>
                <div className={`text-2xl font-bold ${is3D ? 'text-slate-100' : ''}`}>{(displayState.average_mastery * 100).toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};


export default Dashboard;
