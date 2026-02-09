import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useCreateProject, useUpdateProject } from '@/hooks/useProjects';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];

const projectSchema = z.object({
  code: z.string().min(1, 'Project code is required').max(50),
  name: z.string().min(1, 'Project name is required').max(200),
  client: z.string().min(1, 'Client name is required').max(200),
  location: z.string().max(200).optional(),
  start_date: z.string().min(1, 'Start date is required'),
  target_completion_date: z.string().min(1, 'Target completion date is required'),
  boq_master_ref: z.string().max(100).optional(),
  boq_version: z.string().max(50).optional(),
  project_manager: z.string().max(100).optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
}

export function ProjectFormDialog({ open, onOpenChange, project }: ProjectFormDialogProps) {
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const isEditing = !!project;

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      code: '',
      name: '',
      client: '',
      location: '',
      start_date: '',
      target_completion_date: '',
      boq_master_ref: '',
      boq_version: '',
      project_manager: '',
    },
  });

  useEffect(() => {
    if (project) {
      form.reset({
        code: project.code,
        name: project.name,
        client: project.client,
        location: project.location || '',
        start_date: project.start_date,
        target_completion_date: project.target_completion_date,
        boq_master_ref: project.boq_master_ref || '',
        boq_version: project.boq_version || '',
        project_manager: project.project_manager || '',
      });
    } else {
      form.reset({
        code: '',
        name: '',
        client: '',
        location: '',
        start_date: '',
        target_completion_date: '',
        boq_master_ref: '',
        boq_version: '',
        project_manager: '',
      });
    }
  }, [project, form]);

  const onSubmit = async (data: ProjectFormData) => {
    try {
      if (isEditing && project) {
        await updateProject.mutateAsync({
          id: project.id,
          ...data,
          location: data.location || null,
          boq_master_ref: data.boq_master_ref || null,
          boq_version: data.boq_version || null,
          project_manager: data.project_manager || null,
        });
        toast.success('Project updated successfully');
      } else {
        await createProject.mutateAsync({
          ...data,
          location: data.location || null,
          boq_master_ref: data.boq_master_ref || null,
          boq_version: data.boq_version || null,
          project_manager: data.project_manager || null,
        });
        toast.success('Project created successfully');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(isEditing ? 'Failed to update project' : 'Failed to create project');
    }
  };

  const isSubmitting = createProject.isPending || updateProject.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Project' : 'New Project'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update project details' : 'Create a new project for tracking'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Code</FormLabel>
                    <FormControl>
                      <Input placeholder="VL-2024-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Villa Serena" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="client"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <FormControl>
                      <Input placeholder="Client name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Dubai" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_completion_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Completion</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="boq_master_ref"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>BOQ Master Ref</FormLabel>
                    <FormControl>
                      <Input placeholder="BOQ-VL001-R12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="boq_version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>BOQ Version</FormLabel>
                    <FormControl>
                      <Input placeholder="12.3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="project_manager"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Manager</FormLabel>
                  <FormControl>
                    <Input placeholder="PM name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {isEditing ? 'Update Project' : 'Create Project'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
