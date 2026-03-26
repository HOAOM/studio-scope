import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProjectMemberProfile {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-members-profiles', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      // Fetch members
      const { data: members, error: mErr } = await supabase
        .from('project_members')
        .select('id, user_id, role')
        .eq('project_id', projectId);
      if (mErr) throw mErr;
      if (!members?.length) return [];

      // Fetch profiles for those user_ids
      const userIds = members.map(m => m.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', userIds);
      if (pErr) throw pErr;

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      return members.map(m => {
        const profile = profileMap.get(m.user_id);
        return {
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          display_name: profile?.display_name || null,
          email: profile?.email || null,
        } as ProjectMemberProfile;
      });
    },
    enabled: !!projectId,
  });
}
