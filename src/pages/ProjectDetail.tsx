import { useParams, Link } from 'react-router-dom';
import { getProjectById } from '@/data/mockProjects';
import { calculateOverallStatus } from '@/types/warroom';
import { KPIBlock } from '@/components/warroom/KPIBlock';
import { StatusBadge } from '@/components/warroom/StatusBadge';
import { BOQMatrix } from '@/components/warroom/BOQMatrix';
import { ItemTracker } from '@/components/warroom/ItemTracker';
import { 
  ArrowLeft, 
  Calendar, 
  User, 
  MapPin, 
  FileText,
  Activity
} from 'lucide-react';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = projectId ? getProjectById(projectId) : undefined;
  
  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Project Not Found</h1>
          <Link to="/" className="text-primary hover:underline">
            ← Back to War Room
          </Link>
        </div>
      </div>
    );
  }
  
  const overallStatus = calculateOverallStatus(project.kpis);

  return (
    <div className="min-h-screen bg-background war-room-grid">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                to="/" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">War Room</span>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
                  <StatusBadge 
                    status={overallStatus} 
                    label={overallStatus === 'at-risk' ? 'At Risk' : overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
                    pulse={overallStatus === 'unsafe'}
                  />
                </div>
                <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="w-4 h-4" />
              Last updated: <span className="font-mono">{project.lastUpdateDate}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Section A: Project Summary */}
        <section className="animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Info */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Project Summary</h2>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Client:</span>
                  <span className="text-foreground font-medium">{project.client}</span>
                </div>
                
                {project.location && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Location:</span>
                    <span className="text-foreground">{project.location}</span>
                  </div>
                )}
                
                {project.projectManager && (
                  <div className="flex items-center gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">PM:</span>
                    <span className="text-foreground">{project.projectManager}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Timeline:</span>
                  <span className="font-mono text-foreground">
                    {project.startDate} → {project.targetCompletionDate}
                  </span>
                </div>
                
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-3 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">BOQ Master Ref:</span>
                    <span className="font-mono text-primary">{project.boqMasterRef}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm mt-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">BOQ Version:</span>
                    <span className="font-mono text-foreground">{project.boqVersion}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI Dashboard */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Key Performance Indicators</h2>
              
              <div className="grid grid-cols-2 gap-3">
                <KPIBlock 
                  label="BOQ Completeness" 
                  value={project.kpis.boqCompleteness} 
                />
                <KPIBlock 
                  label="Item Approval Coverage" 
                  value={project.kpis.itemApprovalCoverage} 
                />
                <KPIBlock 
                  label="Procurement Readiness" 
                  value={project.kpis.procurementReadiness} 
                />
                <KPIBlock 
                  label="Delivery Risk" 
                  value={project.kpis.deliveryRiskIndicator}
                  inverse
                />
                <div className="col-span-2">
                  <KPIBlock 
                    label="Installation Readiness" 
                    value={project.kpis.installationReadiness} 
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section B: BOQ Coverage Matrix */}
        <section className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <BOQMatrix coverage={project.boqCoverage} />
        </section>

        {/* Section C: Item Tracker */}
        <section className="animate-fade-in" style={{ animationDelay: '200ms' }}>
          <ItemTracker items={project.items} />
        </section>
      </main>
    </div>
  );
}
