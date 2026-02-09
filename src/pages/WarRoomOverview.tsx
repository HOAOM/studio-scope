import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProjects, useDeleteProject } from '@/hooks/useProjects';
import { StatusBadge } from '@/components/warroom/StatusBadge';
import { KPIBlock } from '@/components/warroom/KPIBlock';
import { ProjectFormDialog } from '@/components/warroom/ProjectFormDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { 
  LayoutGrid, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Activity,
  Clock,
  Plus,
  LogOut,
  Loader2,
  Trash2,
  Edit,
  User,
  MapPin
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];
type StatusLevel = 'safe' | 'at-risk' | 'unsafe';

// Simple KPI calculation based on project dates
function calculateProjectStatus(project: Project): StatusLevel {
  const now = new Date();
  const target = new Date(project.target_completion_date);
  const start = new Date(project.start_date);
  
  const totalDuration = target.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const progress = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
  
  if (progress > 90) return 'unsafe';
  if (progress > 70) return 'at-risk';
  return 'safe';
}

export default function WarRoomOverview() {
  const [filterStatus, setFilterStatus] = useState<StatusLevel | 'all'>('all');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  const deleteProject = useDeleteProject();

  // Calculate summary stats
  const stats = useMemo(() => {
    const byStatus = { safe: 0, 'at-risk': 0, unsafe: 0 };
    projects.forEach(p => {
      const status = calculateProjectStatus(p);
      byStatus[status]++;
    });
    return byStatus;
  }, [projects]);
  
  // Filter projects
  const filteredProjects = useMemo(() => {
    if (filterStatus === 'all') return projects;
    return projects.filter(p => calculateProjectStatus(p) === filterStatus);
  }, [filterStatus, projects]);
  
  const currentDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
  };

  const handleEditProject = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setProjectDialogOpen(true);
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject.mutateAsync(projectToDelete.id);
      toast.success('Project deleted');
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    } catch {
      toast.error('Failed to delete project');
    }
  };

  const openDeleteDialog = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
            <div className="flex items-center gap-4">
              <button
                onClick={() => setFilterStatus('all')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === 'all' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="font-semibold">{projects.length}</span>
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
              </button>
              
              <button
                onClick={() => setFilterStatus('at-risk')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === 'at-risk' ? 'bg-status-at-risk-bg' : 'hover:bg-status-at-risk-bg'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-status-at-risk" />
                <span className="font-semibold text-status-at-risk">{stats['at-risk']}</span>
              </button>
              
              <button
                onClick={() => setFilterStatus('unsafe')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === 'unsafe' ? 'bg-status-unsafe-bg' : 'hover:bg-status-unsafe-bg'
                }`}
              >
                <XCircle className="w-4 h-4 text-status-unsafe" />
                <span className="font-semibold text-status-unsafe">{stats.unsafe}</span>
              </button>

              <div className="h-6 w-px bg-border mx-2" />

              <Button onClick={() => { setEditingProject(null); setProjectDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>

              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
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
        
        {projects.length === 0 ? (
          <div className="text-center py-20">
            <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No Projects Yet</h2>
            <p className="text-muted-foreground mb-6">Create your first project to start tracking</p>
            <Button onClick={() => { setEditingProject(null); setProjectDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProjects.map((project, index) => {
              const status = calculateProjectStatus(project);
              return (
                <Card 
                  key={project.id} 
                  className="project-card cursor-pointer bg-card border-border hover:border-primary/50 transition-all"
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
                          <StatusBadge status={status} label={status === 'at-risk' ? 'At Risk' : status.charAt(0).toUpperCase() + status.slice(1)} size="sm" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => handleEditProject(project, e)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => openDeleteDialog(project, e)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3" />
                        <span>{project.client}</span>
                      </div>
                      {project.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3" />
                          <span>{project.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        <span className="font-mono">{project.start_date} → {project.target_completion_date}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        
        {filteredProjects.length === 0 && projects.length > 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No projects match the selected filter.</p>
          </div>
        )}
      </main>

      {/* Project Form Dialog */}
      <ProjectFormDialog 
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        project={editingProject}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This action cannot be undone and will delete all items associated with this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
