import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export function ReferralCodesPanel() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['referral-codes'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('referral_codes')
        .select('id, code, is_active, total_redemptions, created_at, organization_id, organizations(name)')
        .order('total_redemptions', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Referral codes</CardTitle>
        <p className="text-xs text-muted-foreground">
          Auto-generated for every organization. Read-only.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead className="text-center">Redemptions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="text-sm">{r.organizations?.name ?? '—'}</TableCell>
                  <TableCell className="text-center text-xs">{r.total_redemptions}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? 'default' : 'secondary'}>
                      {r.is_active ? 'active' : 'inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
