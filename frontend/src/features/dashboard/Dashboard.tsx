import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import type { LearnerState } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

import type { GraphData } from '../../types';

interface DashboardProps {
  state: LearnerState | null;
  graphData?: GraphData | null;
}

const Dashboard: React.FC<DashboardProps> = ({ state, graphData }) => {
  const { t } = useLanguage();
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
    return null; 
  }, [state, graphData]);

  if (!displayState) return null;

  return (
    <div className="flex gap-4 mb-4">
      <Card className="w-32">
        <CardContent className="p-4 flex flex-col items-center justify-center">
          <div className="text-xs font-medium text-muted-foreground mb-1">{t('dashboard.total')}</div>
          <div className="text-2xl font-bold">{displayState.total}</div>
        </CardContent>
      </Card>
      <Card className="w-32">
        <CardContent className="p-4 flex flex-col items-center justify-center">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t('dashboard.mastered')}</div>
            <div className="text-2xl font-bold text-green-600">{displayState.mastered}</div>
        </CardContent>
      </Card>
      <Card className="w-32">
        <CardContent className="p-4 flex flex-col items-center justify-center">
            <div className="text-xs font-medium text-muted-foreground mb-1">{t('dashboard.average_mastery')}</div>
            <div className="text-2xl font-bold">{(displayState.average_mastery * 100).toFixed(1)}%</div>
        </CardContent>
      </Card>
    </div>
  );
};


export default Dashboard;
