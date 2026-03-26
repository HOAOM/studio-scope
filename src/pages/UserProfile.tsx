/**
 * UserProfile — Profile page with avatar upload, name, and role display
 */
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Save, User } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UserProfile() {
  const { user } = useAuth();
  const { roles } = useUserRole();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single();
      if (data) {
        setDisplayName(data.display_name || '');
        setAvatarUrl((data as any).avatar_url || null);
      }
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName } as any)
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Profile updated');
    } catch { toast.error('Failed to update profile'); }
    setLoading(false);
  };

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('item-files')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('item-files')
        .getPublicUrl(path);

      const { error: updateError } = await (supabase as any)
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast.success('Avatar updated');
    } catch { toast.error('Failed to upload avatar'); }
    setUploading(false);
  };

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-bold text-foreground">My Profile</h1>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="w-20 h-20 border-2 border-border">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <label className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
                  <Camera className="w-3.5 h-3.5" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                    }}
                    disabled={uploading}
                  />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{displayName || 'No name set'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                <div className="flex gap-1 mt-2">
                  {roles.map(role => (
                    <Badge key={role} variant="secondary" className="text-[10px]">{role.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
            </div>

            <Button onClick={handleSave} disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
