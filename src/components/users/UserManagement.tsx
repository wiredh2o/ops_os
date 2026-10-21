import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Edit, Trash2, Shield, Users, Mail, RotateCcw } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { HIDDEN_FINANCIAL_FLAGS, MarketingFinancialFlags } from '@/hooks/financial-visibility';
import { useQueryClient } from '@tanstack/react-query';
import { NotificationPreferences } from '@/components/settings/NotificationPreferences';

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean;
  company_id: string | null;
  price_level_id: string | null;
  marketing_view_revenue?: boolean;
  marketing_view_margin?: boolean;
  marketing_view_supplier_price?: boolean;
  
  created_at: string;
  updated_at: string;
}

type AppRole = Database['public']['Enums']['app_role'];

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

interface Company {
  id: string;
  name: string;
}

interface PendingInvite {
  id: string;
  email: string;
  intended_role: AppRole;
  company_id: string | null;
  status: string;
  created_at: string;
  invite_message: string | null;
  is_registered?: boolean;
}

const ROLE_DESCRIPTIONS = {
  admin: 'Full system access',
  production: 'Production and inventory',
  accounting: 'Accounting',
  marketing: 'Marketing with per-user financial visibility',
  sales_support: 'Sales and customer management',
  tech_support: 'RMA review and tech-support appointments',
  car_wash_admin: 'Car wash administrative functions',
  car_wash_employee: 'Car wash employee access',
  vendor_admin: 'Vendor administrative functions',
  vendor_employee: 'Vendor employee access',
  distributor_admin: 'Distributor administrative functions',
  distributor_employee: 'Distributor employee access',
};

const ROLE_COLORS = {
  admin: 'destructive',
  tech_support: 'default',
  sales_support: 'default',
  car_wash_admin: 'default',
  car_wash_employee: 'secondary',
  vendor_admin: 'default',
  vendor_employee: 'secondary',
  distributor_admin: 'default',
  distributor_employee: 'secondary',
} as const;

export function UserManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [financialFlags, setFinancialFlags] = useState<MarketingFinancialFlags>(HIDDEN_FINANCIAL_FLAGS);
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [notificationProfile, setNotificationProfile] = useState<Profile | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    company_id: '',
    roles: [] as AppRole[],
  });

  const [inviteData, setInviteData] = useState({
    email: '',
    company_id: '',
    intended_role: 'car_wash_admin' as AppRole,
    invite_message: '',
  });

  const isInternal = currentUserRoles.includes('admin') || currentUserRoles.includes('sales_support');

  useEffect(() => {
    loadData();
    loadCurrentUserRoles();
  }, []);

  const loadCurrentUserRoles = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) throw error;
      setCurrentUserRoles(data.map(r => r.role as string));
    } catch (error) {
      console.error('Error loading current user roles:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      // Load profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      // Load user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;
      setUserRoles(rolesData || []);

      // Load companies
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (companiesError) throw companiesError;
      setCompanies(companiesData || []);

      // Load pending invites and check registration status
      const { data: invitesData, error: invitesError } = await supabase
        .from('pending_invites')
        .select('*')
        .order('created_at', { ascending: false });

      if (invitesError) throw invitesError;
      
      // Check which invited emails are already registered
      const invitesWithStatus = await Promise.all(
        (invitesData || []).map(async (invite) => {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', invite.email)
            .single();
          
          return {
            ...invite,
            is_registered: !!profileData
          };
        })
      );
      
      setPendingInvites(invitesWithStatus);

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const canManageUser = (targetUserId: string): boolean => {
    // Don't allow users to manage themselves through this interface
    if (targetUserId === user?.id) return false;
    
    // Admins can manage anyone except themselves
    if (currentUserRoles.includes('admin')) return true;

    // Car wash admins can manage car wash employees in their company
    if (currentUserRoles.includes('car_wash_admin')) {
      const targetProfile = profiles.find(p => p.id === targetUserId);
      const currentProfile = profiles.find(p => p.id === user?.id);
      
      if (targetProfile && currentProfile && targetProfile.company_id === currentProfile.company_id) {
        const targetRoles = userRoles.filter(r => r.user_id === targetUserId).map(r => r.role);
        return targetRoles.includes('car_wash_employee') || targetRoles.length === 0;
      }
    }

    return false;
  };

  const canCreateUser = (): boolean => {
    return currentUserRoles.includes('admin') || currentUserRoles.includes('sales_support') || currentUserRoles.includes('car_wash_admin') || currentUserRoles.includes('vendor_admin') || currentUserRoles.includes('distributor_admin');
  };

  const canResetPassword = (targetUserId: string): boolean => {
    // Can't reset own password through this interface
    if (targetUserId === user?.id) return false;
    
    // Admins can reset anyone's password
    if (currentUserRoles.includes('admin')) return true;
    
    // Sales support can only reset car_wash_admin passwords
    if (currentUserRoles.includes('sales_support')) {
      const targetRoles = getUserRoles(targetUserId);
      return targetRoles.includes('car_wash_admin');
    }
    
    return false;
  };

  const handleCreateUser = async () => {
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email,
        email_confirm: true,
        user_metadata: {
          first_name: formData.first_name,
          last_name: formData.last_name,
        },
      });

      if (authError) throw authError;

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          company_id: formData.company_id === 'none' ? null : formData.company_id,
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;

      // Add roles
      if (formData.roles.length > 0) {
        const roleInserts = formData.roles.map(role => ({
          user_id: authData.user.id,
          role: role as AppRole,
        }));

        const { error: rolesError } = await supabase
          .from('user_roles')
          .insert(roleInserts);

        if (rolesError) throw rolesError;
      }

      toast({
        title: 'Success',
        description: 'User created successfully',
      });

      setIsCreateOpen(false);
      setFormData({ email: '', first_name: '', last_name: '', phone: '', company_id: '', roles: [] as AppRole[] });
      loadData();

    } catch (error) {
      console.error('Error creating user:', error);
      toast({
        title: 'Error',
        description: 'Failed to create user',
        variant: 'destructive',
      });
    }
  };

  const handleInvite = async () => {
    try {
      if (!inviteData.email) {
        toast({ title: 'Missing email', description: 'Email is required', variant: 'destructive' });
        return;
      }
      
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inviteData.email)) {
        toast({ title: 'Invalid email', description: 'Please enter a valid email address', variant: 'destructive' });
        return;
      }
      
      if (!isInternal && !inviteData.company_id) {
        toast({ title: 'Missing company', description: 'Please select a company', variant: 'destructive' });
        return;
      }

      // Only admins can choose role; others force car_wash_admin
      const intended_role = currentUserRoles.includes('admin')
        ? inviteData.intended_role
        : ('car_wash_admin' as AppRole);

      const body: any = {
        email: inviteData.email,
        intendedRole: intended_role,
      };
      if (inviteData.invite_message) {
        body.inviteMessage = inviteData.invite_message;
      }
      if (!isInternal && inviteData.company_id) {
        body.companyId = inviteData.company_id;
      }

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body,
      });

      if (error) throw error;

      toast({ title: 'Invitation sent', description: `Invite sent to ${inviteData.email}` });
      setIsInviteOpen(false);
      setInviteData({ email: '', company_id: '', intended_role: 'car_wash_admin' as AppRole, invite_message: '' });
      loadData(); // Refresh pending invites
    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to send invite',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateUser = async () => {
    if (!editingProfile) return;

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          phone: formData.phone || null,
          company_id: formData.company_id === 'none' ? null : formData.company_id,
          ...(currentUserRoles.includes('admin') ? (formData.roles.includes('marketing') ? financialFlags : HIDDEN_FINANCIAL_FLAGS) : {}),
        })
        .eq('id', editingProfile.id);

      if (profileError) throw profileError;

      // Update roles - delete existing and insert new
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', editingProfile.id);

      if (deleteError) throw deleteError;

      if (formData.roles.length > 0) {
        const roleInserts = formData.roles.map(role => ({
          user_id: editingProfile.id,
          role: role as AppRole,
        }));

        const { error: rolesError } = await supabase
          .from('user_roles')
          .insert(roleInserts);

        if (rolesError) throw rolesError;
      }

      toast({
        title: 'Success',
        description: 'User updated successfully',
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['marketing-financial-flags', editingProfile.id] }),
        queryClient.invalidateQueries({ queryKey: ['staff-user-roles', editingProfile.id] }),
        queryClient.invalidateQueries({ queryKey: ['staff-marketing-view-permissions', editingProfile.id] }),
      ]);

      // Close dialog and reset state first to prevent race conditions
      setIsEditOpen(false);
      setEditingProfile(null);
      
      // Reset form data after dialog is closed
      setTimeout(() => {
        setFormData({ email: '', first_name: '', last_name: '', phone: '', company_id: '', roles: [] as AppRole[] });
      }, 100);
      
      // Reload data to reflect changes
      loadData();

    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user',
        variant: 'destructive',
      });
    }
  };

  const handleToggleUserActive = async (userId: string) => {
    if (!canManageUser(userId)) return;

    try {
      const targetProfile = profiles.find(p => p.id === userId);
      if (!targetProfile) return;

      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !targetProfile.is_active })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `User ${targetProfile.is_active ? 'deactivated' : 'activated'} successfully`,
      });

      loadData();
    } catch (error) {
      console.error('Error toggling user status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!canManageUser(userId)) return;

    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId }
      });

      if (error) throw error;

      const result = data as { success: boolean; action: 'deleted' | 'deactivated'; message: string; error?: string };
      
      if (!result.success) {
        throw new Error(result.error || 'Unknown error occurred');
      }

      toast({
        title: "Success",
        description: result.message,
      });
      
      loadData();
    } catch (error) {
      console.error('Error processing user deletion:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process user deletion",
        variant: "destructive",
      });
    }
  };

  const handleResetPassword = async (userId: string, userEmail: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { userId }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Password reset sent',
          description: data.message,
        });
      } else {
        throw new Error(data?.error || 'Failed to reset password');
      }
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to reset password',
        variant: 'destructive',
      });
    }
  };

  const getUserRoles = (userId: string): AppRole[] => {
    return userRoles.filter(r => r.user_id === userId).map(r => r.role);
  };

  const getCompanyName = (companyId: string | null): string => {
    if (!companyId) return 'No Company';
    const company = companies.find(c => c.id === companyId);
    return company?.name || 'Unknown';
  };

  const handleResendInvite = async (invite: PendingInvite) => {
    try {
      // Check if user is already registered
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', invite.email)
        .single();
      
      if (profileData) {
        toast({
          title: 'User already registered',
          description: `${invite.email} has already created an account. Consider removing this pending invite.`,
          variant: 'destructive',
        });
        return;
      }

      const body: any = {
        email: invite.email,
        intendedRole: invite.intended_role,
      };
      if (invite.invite_message) {
        body.inviteMessage = invite.invite_message;
      }
      if (invite.company_id) {
        body.companyId = invite.company_id;
      }

      const { data, error } = await supabase.functions.invoke('invite-user', {
        body,
      });

      if (error) throw error;

      toast({ title: 'Invitation resent', description: `Invite resent to ${invite.email}` });
      loadData(); // Refresh pending invites
    } catch (error: any) {
      console.error('Error resending invite:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to resend invite',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveInvite = async (inviteId: string) => {
    try {
      // Check if user has permission to remove invites
      if (!currentUserRoles.includes('admin') && !currentUserRoles.includes('sales_support')) {
        toast({
          title: 'Access denied',
          description: 'You do not have permission to remove invites',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('pending_invites')
        .delete()
        .eq('id', inviteId);

      if (error) {
        console.error('RLS Error details:', error);
        throw error;
      }

      toast({ title: 'Invite removed', description: 'Pending invite has been removed' });
      loadData();
    } catch (error: any) {
      console.error('Error removing invite:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to remove invite',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (profile: Profile) => {
    setEditingProfile(profile);
    setFinancialFlags({
      marketing_view_revenue: profile.marketing_view_revenue === true,
      marketing_view_margin: profile.marketing_view_margin === true,
      marketing_view_supplier_price: profile.marketing_view_supplier_price === true,
    });
    const roles = getUserRoles(profile.id);
    setFormData({
      email: profile.email,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
      company_id: profile.company_id || 'none',
      roles,
    });
    setIsEditOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">User Management</h2>
          <p className="text-muted-foreground">Manage users, roles, and permissions</p>
        </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="company">Company</Label>
                  <Select
                    value={formData.company_id}
                    onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Company</SelectItem>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Roles</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => {
                      // Role restrictions
                      if (!currentUserRoles.includes('admin')) {
                        if (role === 'admin') {
                          return null;
                        }
                        // Vendor admins can only create vendor employees
                        if (currentUserRoles.includes('vendor_admin') && !role.startsWith('vendor_')) {
                          return null;
                        }
                        // Distributor admins can only create distributor employees
                        if (currentUserRoles.includes('distributor_admin') && !role.startsWith('distributor_')) {
                          return null;
                        }
                        // Car wash admins can only create car wash employees
                        if (currentUserRoles.includes('car_wash_admin') && !role.startsWith('car_wash_')) {
                          return null;
                        }
                        // Sales support can only create car wash users
                        if (currentUserRoles.includes('sales_support') && !role.startsWith('car_wash_')) {
                          return null;
                        }
                      }

                      return (
                        <label key={role} className="flex items-center space-x-2">
                           <input
                            type="checkbox"
                            checked={formData.roles.includes(role as AppRole)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, roles: [...formData.roles, role as AppRole] });
                              } else {
                                setFormData({ ...formData, roles: formData.roles.filter(r => r !== role) });
                              }
                            }}
                          />
                          <span className="text-sm">{role}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <Button onClick={handleCreateUser} className="w-full">
                  Create User
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Invite User Dialog */}
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Shield className="w-4 h-4 mr-2" />
                Invite User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Invite User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="invite_email">Email</Label>
                  <Input
                    id="invite_email"
                    type="email"
                    value={inviteData.email}
                    onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  />
                </div>
                {!isInternal && (
                  <div>
                    <Label htmlFor="invite_company">Company</Label>
                    <Select
                      value={inviteData.company_id}
                      onValueChange={(value) => setInviteData({ ...inviteData, company_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {currentUserRoles.includes('admin') ? (
                  <div>
                    <Label htmlFor="invite_role">Role</Label>
                    <Select
                      value={inviteData.intended_role}
                      onValueChange={(value) => setInviteData({ ...inviteData, intended_role: value as AppRole })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(ROLE_DESCRIPTIONS).map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>Role</Label>
                    <Input value="car_wash_admin" disabled />
                  </div>
                )}
                <div>
                  <Label htmlFor="invite_message">Message (optional)</Label>
                  <Textarea
                    id="invite_message"
                    value={inviteData.invite_message}
                    onChange={(e) => setInviteData({ ...inviteData, invite_message: e.target.value })}
                    placeholder="Add a personal note..."
                  />
                </div>
                <Button onClick={handleInvite} className="w-full">
                  Send Invite
                </Button>
              </div>
            </DialogContent>
          </Dialog>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="pending-invites">Pending Invites</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((profile) => {
                    const roles = getUserRoles(profile.id);
                    const canManage = canManageUser(profile.id);

                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          {profile.first_name || profile.last_name
                            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                            : 'No Name'}
                        </TableCell>
                        <TableCell>{profile.email}</TableCell>
                        <TableCell>{getCompanyName(profile.company_id)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {roles.map((role) => (
                              <Badge key={role} variant={ROLE_COLORS[role as keyof typeof ROLE_COLORS] || 'default'}>
                                {role}
                              </Badge>
                            ))}
                            {roles.length === 0 && (
                              <Badge variant="outline">No Roles</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={profile.is_active ? 'default' : 'secondary'}>
                            {profile.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                         <TableCell>
                           <div className="flex gap-2">
                             {(currentUserRoles.includes('admin') || (profile.id !== user?.id && profile.company_id != null && profile.company_id === profiles.find(p => p.id === user?.id)?.company_id && currentUserRoles.some(role => ['car_wash_admin','distributor_admin','vendor_admin'].includes(role)) && roles.some(role => ['car_wash_employee','distributor_employee','vendor_employee'].includes(role)))) && <Button variant="outline" size="sm" aria-label={`Notification preferences for ${profile.email}`} onClick={() => setNotificationProfile(profile)}><Mail className="h-4 w-4" /></Button>}
                             {canManage && (
                               <>
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   onClick={() => openEditDialog(profile)}
                                 >
                                   <Edit className="w-4 h-4" />
                                 </Button>
                                 {canResetPassword(profile.id) && (
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => handleResetPassword(profile.id, profile.email)}
                                   >
                                     <RotateCcw className="w-4 h-4" />
                                   </Button>
                                 )}
                                 <Button
                                   variant="outline"
                                   size="sm"
                                   onClick={() => handleDeleteUser(profile.id)}
                                 >
                                   <Trash2 className="w-4 h-4" />
                                   {currentUserRoles.includes('car_wash_admin') ? 'Toggle' : ''}
                                 </Button>
                               </>
                             )}
                           </div>
                         </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending-invites">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Pending Invites
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                 <TableBody>
                  {pendingInvites.map((invite) => {
                    const isRegistered = invite.is_registered;
                    const canResend = !isRegistered && (invite.status === 'pending' || invite.status === 'failed');
                    
                    // Debug logging
                    console.log('Invite debug:', {
                      email: invite.email,
                      status: invite.status,
                      isRegistered,
                      canResend
                    });
                    
                    return (
                      <TableRow key={invite.id}>
                        <TableCell>{invite.email}</TableCell>
                        <TableCell>
                          <Badge variant={ROLE_COLORS[invite.intended_role as keyof typeof ROLE_COLORS] || 'default'}>
                            {invite.intended_role}
                          </Badge>
                        </TableCell>
                        <TableCell>{getCompanyName(invite.company_id)}</TableCell>
                        <TableCell>
                          <Badge variant={
                            isRegistered ? 'default' : 
                            invite.status === 'pending' ? 'secondary' : 'outline'
                          }>
                            {isRegistered ? 'Registered' : invite.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(invite.created_at).toLocaleDateString()}
                        </TableCell>
                         <TableCell>
                           <div className="flex gap-2">
                             {canResend ? (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => handleResendInvite(invite)}
                               >
                                 <RotateCcw className="w-4 h-4 mr-1" />
                                 Resend
                               </Button>
                             ) : isRegistered && canResetPassword(profiles.find(p => p.email === invite.email)?.id || '') ? (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   const profile = profiles.find(p => p.email === invite.email);
                                   if (profile) handleResetPassword(profile.id, profile.email);
                                 }}
                               >
                                 <RotateCcw className="w-4 h-4 mr-1" />
                                 Reset Password
                               </Button>
                             ) : null}
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => handleRemoveInvite(invite.id)}
                               disabled={!currentUserRoles.includes('admin') && !currentUserRoles.includes('sales_support')}
                             >
                               <Trash2 className="w-4 h-4 mr-1" />
                               Remove
                             </Button>
                           </div>
                         </TableCell>
                      </TableRow>
                    );
                  })}
                  {pendingInvites.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No pending invites
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                disabled
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit_first_name">First Name</Label>
                <Input
                  id="edit_first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit_last_name">Last Name</Label>
                <Input
                  id="edit_last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit_phone">Phone</Label>
              <Input
                id="edit_phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit_company">Company</Label>
              <Select
                value={formData.company_id}
                onValueChange={(value) => setFormData({ ...formData, company_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Company</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(ROLE_DESCRIPTIONS).map(([role, description]) => {
                  // Role restrictions
                  if (!currentUserRoles.includes('admin')) {
                    if (role === 'admin') {
                      return null;
                    }
                    // Vendor admins can only edit vendor employees
                    if (currentUserRoles.includes('vendor_admin') && !role.startsWith('vendor_')) {
                      return null;
                    }
                    // Distributor admins can only edit distributor employees
                    if (currentUserRoles.includes('distributor_admin') && !role.startsWith('distributor_')) {
                      return null;
                    }
                    // Car wash admins can only edit car wash employees
                    if (currentUserRoles.includes('car_wash_admin') && !role.startsWith('car_wash_')) {
                      return null;
                    }
                    // Sales support can only edit car wash users
                    if (currentUserRoles.includes('sales_support') && !role.startsWith('car_wash_')) {
                      return null;
                    }
                  }

                  return (
                    <label key={role} className="flex items-center space-x-2">
                       <input
                        type="checkbox"
                        checked={formData.roles.includes(role as AppRole)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, roles: [...formData.roles, role as AppRole] });
                          } else {
                            setFormData({ ...formData, roles: formData.roles.filter(r => r !== role) });
                          }
                        }}
                      />
                      <span className="text-sm">{role}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {currentUserRoles.includes('admin') && formData.roles.includes('marketing') && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Marketing financial visibility</legend>
                {([
                  ['marketing_view_revenue', 'Revenue'],
                  ['marketing_view_margin', 'Margin'],
                  ['marketing_view_supplier_price', 'Supplier price'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <Label htmlFor={key}>{label}</Label>
                    <Switch id={key} checked={financialFlags[key]} onCheckedChange={checked => setFinancialFlags(previous => ({ ...previous, [key]: checked }))} />
                  </div>
                ))}
              </fieldset>
            )}
            <Button onClick={handleUpdateUser} className="w-full">
              Update User
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(notificationProfile)} onOpenChange={open => { if (!open) setNotificationProfile(null); }}><DialogContent className="max-w-md max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Employee notifications</DialogTitle></DialogHeader>{notificationProfile && <><p className="text-sm">{notificationProfile.email}</p><NotificationPreferences targetId={notificationProfile.id} allowLock /></>}</DialogContent></Dialog>
    </div>
  );
}