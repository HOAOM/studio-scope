import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockProjects } from '@/data/mockProjects';
import { ProjectCard } from '@/components/warroom/ProjectCard';
import { StatusBadge } from '@/components/warroom/StatusBadge';
import { calculateOverallStatus, StatusLevel } from '@/types/warroom';
import { 
  LayoutGrid, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Activity,
  Clock
} from 'lucide-react';

export default function WarRoomOverview() {
  const [filterStatus, setFilterStatus] = useState<StatusLevel | 'all'>('all');
  
  // Calculate summary stats
  const stats = useMemo(() => {
    const byStatus = { safe: 0, 'at-risk': 0, unsafe: 0 };
    mockProjects.forEach(p => {
      const status = calculateOverallStatus(p.kpis);
      byStatus[status]++;
    });
    return byStatus;
  }, []);
  
  // Filter projects
  const filteredProjects = useMemo(() => {
    if (filterStatus === 'all') return mockProjects;
    return mockProjects.filter(p => calculateOverallStatus(p.kpis) === filterStatus);
  }, [filterStatus]);
  
  const currentDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-background war-room-grid">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-primary" />
                <h1 className="text-2xl font-bold text-foreground">War Room</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                {currentDate}
              </p>
            </div>
            
            {/* Summary Stats */}
            <div className="flex items-center gap-6">
              <button
                onClick={() => setFilterStatus('all')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === 'all' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="font-semibold">{mockProjects.length}</span>
                <span className="text-sm">Total</span>
              </button>
              
              <button
                onClick={() => setFilterStatus('safe')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === 'safe' ? 'bg-status-safe-bg' : 'hover:bg-status-safe-bg'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-status-safe" />
                <span className="font-semibold text-status-safe">{stats.safe}</span>
                <span className="text-sm text-muted-foreground">Safe</span>
              </button>
              
              <button
                onClick={() => setFilterStatus('at-risk')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === 'at-risk' ? 'bg-status-at-risk-bg' : 'hover:bg-status-at-risk-bg'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-status-at-risk" />
                <span className="font-semibold text-status-at-risk">{stats['at-risk']}</span>
                <span className="text-sm text-muted-foreground">At Risk</span>
              </button>
              
              <button
                onClick={() => setFilterStatus('unsafe')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === 'unsafe' ? 'bg-status-unsafe-bg' : 'hover:bg-status-unsafe-bg'
                }`}
              >
                <XCircle className="w-4 h-4 text-status-unsafe" />
                <span className="font-semibold text-status-unsafe">{stats.unsafe}</span>
                <span className="text-sm text-muted-foreground">Unsafe</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Projects Grid */}
      <main className="container py-8">
        {filterStatus !== 'all' && (
          <div className="mb-6 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtering by:</span>
            <StatusBadge status={filterStatus} label={filterStatus === 'at-risk' ? 'At Risk' : filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)} size="sm" />
            <button 
              onClick={() => setFilterStatus('all')}
              className="text-xs text-primary hover:underline ml-2"
            >
              Clear filter
            </button>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProjects.map((project, index) => (
            <div 
              key={project.id} 
              style={{ animationDelay: `${index * 50}ms` }}
              className="animate-fade-in"
            >
              <ProjectCard project={project} />
            </div>
          ))}
        </div>
        
        {filteredProjects.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No projects match the selected filter.</p>
          </div>
        )}
      </main>
    </div>
  );
}
