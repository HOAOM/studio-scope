import { Link } from 'react-router-dom';
import { Project, calculateOverallStatus } from '@/types/warroom';
import { KPIBlock } from './KPIBlock';
import { StatusBadge } from './StatusBadge';
import { ChevronRight, MapPin, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const overallStatus = calculateOverallStatus(project.kpis);
  
  const glowClasses = {
    'safe': 'hover:glow-green',
    'at-risk': 'hover:glow-yellow',
    'unsafe': 'glow-red',
  };

  return (
    <Link 
      to={`/project/${project.id}`}
      className={cn(
        'block bg-card rounded-lg border border-border p-5 project-card animate-fade-in',
        glowClasses[overallStatus]
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
            <StatusBadge status={overallStatus} pulse={overallStatus === 'unsafe'} />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
          <p className="text-sm text-muted-foreground">{project.client}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </div>
      
      {/* Meta */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-muted-foreground">
        {project.location && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {project.location}
          </span>
        )}
        {project.projectManager && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {project.projectManager}
          </span>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <KPIBlock 
          label="BOQ Complete" 
          value={project.kpis.boqCompleteness} 
        />
        <KPIBlock 
          label="Approved" 
          value={project.kpis.itemApprovalCoverage} 
        />
        <KPIBlock 
          label="Procurement" 
          value={project.kpis.procurementReadiness} 
        />
        <KPIBlock 
          label="Delivery Risk" 
          value={project.kpis.deliveryRiskIndicator}
          inverse
        />
        <KPIBlock 
          label="Installation" 
          value={project.kpis.installationReadiness} 
        />
      </div>
      
      {/* Last Update */}
      <div className="mt-4 pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Last updated: <span className="font-mono">{project.lastUpdateDate}</span>
        </span>
      </div>
    </Link>
  );
}
