import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  useFloors, useUpsertFloor, useDeleteFloor,
  useRooms, useUpsertRoom, useDeleteRoom,
  useItemTypes, useUpsertItemType, useDeleteItemType,
  useSubcategories, useUpsertSubcategory, useDeleteSubcategory,
  useCostCategories, useUpsertCostCategory, useDeleteCostCategory,
  useUserRoles, useAddUserRole, useDeleteUserRole,
  useIsAdmin,
} from '@/hooks/useAdminData';
import { MasterDataTable } from '@/components/admin/MasterDataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Shield, Loader2, UserPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Constants } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
const ROLES = Constants.public.Enums.app_role;

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: isAdmin, isLoading: checkingAdmin } = useIsAdmin();

  // Master data hooks
  const { data: floors = [], isLoading: loadingFloors } = useFloors();
  const upsertFloor = useUpsertFloor();
  const deleteFloor = useDeleteFloor();

  const { data: rooms = [], isLoading: loadingRooms } = useRooms();
  const upsertRoom = useUpsertRoom();
  const deleteRoom = useDeleteRoom();

  const { data: itemTypes = [], isLoading: loadingTypes } = useItemTypes();
  const upsertItemType = useUpsertItemType();
  const deleteItemType = useDeleteItemType();

  const { data: subcategories = [], isLoading: loadingSubs } = useSubcategories();
  const upsertSubcategory = useUpsertSubcategory();
  const deleteSubcategory = useDeleteSubcategory();

  const { data: costCategories = [], isLoading: loadingCosts } = useCostCategories();
  const upsertCostCategory = useUpsertCostCategory();
  const deleteCostCategory = useDeleteCostCategory();

  const { data: userRoles = [], isLoading: loadingRoles } = useUserRoles();
  const addUserRole = useAddUserRole();
  const deleteUserRole = useDeleteUserRole();

  // New role form
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('designer');

  if (checkingAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-4">
        <Shield className="w-12 h-12 text-destructive" />
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">You need admin privileges to access this panel.</p>
        <Button variant="outline" onClick={() => navigate('/')}><ArrowLeft className="w-4 h-4 mr-2" />Back to War Room</Button>
      </div>
    );
  }

  const handleAddRole = async () => {
    if (!newUserId.trim()) { toast.error('Enter a user ID'); return; }
    try {
      await addUserRole.mutateAsync({ user_id: newUserId.trim(), role: newRole });
      toast.success('Role assigned');
      setNewUserId('');
    } catch (e: any) {
      toast.error(e.message || 'Error assigning role');
    }
  };

  const itemTypeOptions = itemTypes.map(t => ({ value: t.id, label: `${t.code} - ${t.name}` }));

  return (
    <div className="min-h-screen bg-background war-room-grid">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <Tabs defaultValue="floors" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="floors">Floors</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="types">Item Types</TabsTrigger>
            <TabsTrigger value="subcategories">Subcategories</TabsTrigger>
            <TabsTrigger value="costs">Cost Categories</TabsTrigger>
            <TabsTrigger value="roles">User Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="floors">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <MasterDataTable
                  title="Floors"
                  columns={[
                    { key: 'code', label: 'Code' },
                    { key: 'name', label: 'Name' },
                  ]}
                  data={floors}
                  isLoading={loadingFloors}
                  onSave={async (item) => { await upsertFloor.mutateAsync(item); }}
                  onDelete={async (id) => { await deleteFloor.mutateAsync(id); }}
                  isSaving={upsertFloor.isPending}
                  isDeleting={deleteFloor.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rooms">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <MasterDataTable
                  title="Rooms"
                  columns={[
                    { key: 'code', label: 'Code' },
                    { key: 'name', label: 'Name' },
                  ]}
                  data={rooms}
                  isLoading={loadingRooms}
                  onSave={async (item) => { await upsertRoom.mutateAsync(item); }}
                  onDelete={async (id) => { await deleteRoom.mutateAsync(id); }}
                  isSaving={upsertRoom.isPending}
                  isDeleting={deleteRoom.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="types">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <MasterDataTable
                  title="Item Types"
                  columns={[
                    { key: 'code', label: 'Code' },
                    { key: 'name', label: 'Name' },
                    { key: 'allowed_categories', label: 'Allowed Categories', type: 'text' },
                  ]}
                  data={itemTypes}
                  isLoading={loadingTypes}
                  onSave={async (item) => {
                    // Parse allowed_categories from comma-separated string to array
                    const cats = item.allowed_categories
                      ? (typeof item.allowed_categories === 'string'
                        ? item.allowed_categories.split(',').map((s: string) => s.trim()).filter(Boolean)
                        : item.allowed_categories)
                      : [];
                    await upsertItemType.mutateAsync({ ...item, allowed_categories: cats });
                  }}
                  onDelete={async (id) => { await deleteItemType.mutateAsync(id); }}
                  isSaving={upsertItemType.isPending}
                  isDeleting={deleteItemType.isPending}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Allowed Categories: comma-separated list (e.g. "joinery, lighting"). Valid: joinery, loose-furniture, lighting, finishes, ffe, accessories, appliances
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subcategories">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <MasterDataTable
                  title="Subcategories"
                  columns={[
                    { key: 'code', label: 'Code' },
                    { key: 'name', label: 'Name' },
                    { key: 'item_type_id', label: 'Item Type', type: 'select', options: itemTypeOptions },
                  ]}
                  data={subcategories}
                  isLoading={loadingSubs}
                  onSave={async (item) => { await upsertSubcategory.mutateAsync(item); }}
                  onDelete={async (id) => { await deleteSubcategory.mutateAsync(id); }}
                  isSaving={upsertSubcategory.isPending}
                  isDeleting={deleteSubcategory.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="costs">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <MasterDataTable
                  title="Cost Categories"
                  columns={[
                    { key: 'code', label: 'Code' },
                    { key: 'name', label: 'Name' },
                  ]}
                  data={costCategories}
                  isLoading={loadingCosts}
                  onSave={async (item) => { await upsertCostCategory.mutateAsync(item); }}
                  onDelete={async (id) => { await deleteCostCategory.mutateAsync(id); }}
                  isSaving={upsertCostCategory.isPending}
                  isDeleting={deleteCostCategory.isPending}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles">
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">User Roles</h3>
                
                {/* Add role form */}
                <div className="flex gap-3 mb-6 items-end">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-foreground mb-1 block">User ID</label>
                    <Input value={newUserId} onChange={e => setNewUserId(e.target.value)} placeholder="Paste user UUID" className="font-mono text-sm" />
                  </div>
                  <div className="w-48">
                    <label className="text-sm font-medium text-foreground mb-1 block">Role</label>
                    <Select value={newRole} onValueChange={v => setNewRole(v as AppRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddRole} disabled={addUserRole.isPending}>
                    {addUserRole.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
                    Assign
                  </Button>
                </div>

                {/* Roles list */}
                {loadingRoles ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">User ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Role</th>
                          <th className="px-4 py-3 w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {userRoles.length === 0 ? (
                          <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No roles assigned</td></tr>
                        ) : (
                          userRoles.map(ur => (
                            <tr key={ur.id} className="border-b border-border tracker-row">
                              <td className="px-4 py-3 font-mono text-sm text-foreground">{ur.user_id}</td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">{ur.role}</span>
                              </td>
                              <td className="px-4 py-3">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => {
                                  try {
                                    await deleteUserRole.mutateAsync(ur.id);
                                    toast.success('Role removed');
                                  } catch { toast.error('Error removing role'); }
                                }}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
