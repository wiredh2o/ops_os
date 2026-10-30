import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MarketingFinancialFlags } from './financial-visibility';
import { nextAuthUser } from './auth-session-identity';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: string[];
  rolesLoading: boolean;
  rolesError: Error | null;
  financialFlags: MarketingFinancialFlags | null;
  financialFlagsLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Role assignments are read from Supabase, never from profile metadata or local storage.
  const rolesQuery = useQuery({
    queryKey: ['staff-user-roles', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map(({ role }) => role);
    },
    staleTime: 0,
  });

  const financialFlagsQuery = useQuery({
    queryKey: ['marketing-financial-flags', user?.id],
    enabled: Boolean(user && rolesQuery.data?.includes('marketing')),
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from('profiles')
        .select('marketing_view_revenue, marketing_view_margin, marketing_view_supplier_price')
        .eq('id', user.id).single();
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser((prev) => nextAuthUser(prev, session?.user ?? null));
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser((prev) => nextAuthUser(prev, session?.user ?? null));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    loading,
    roles: user ? rolesQuery.data || [] : [],
    rolesLoading: loading || Boolean(user && rolesQuery.isPending),
    rolesError: rolesQuery.error,
    financialFlags: user ? financialFlagsQuery.data || null : null,
    financialFlagsLoading: Boolean(rolesQuery.data?.includes('marketing') && financialFlagsQuery.isPending),
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};