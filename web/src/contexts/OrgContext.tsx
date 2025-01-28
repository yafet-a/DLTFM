'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface Organization {
  id: string;
  name: string;
  fabric_msp_id: string;
  ca_url: string;
}

interface OrgContextType {
  currentOrg: Organization | null;
  organizations: Organization[];
  setCurrentOrg: (org: Organization) => void;
  loading: boolean;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  organizations: [],
  setCurrentOrg: () => {},
  loading: true,
});

export const useOrg = () => useContext(OrgContext);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();

  // Load user's organizations
  useEffect(() => {
    async function loadOrganizations() {
      if (!session?.user) {
        console.log('No session or user, skipping org load');
        setLoading(false);
        return;
      }

      try {
        console.log('Loading organizations for user:', session.user.id);
        
        const { data: userOrgs, error: userOrgsError } = await supabase
          .from('user_organizations')
          .select(`
            org_id,
            organizations (
              id,
              name,
              fabric_msp_id,
              ca_url
            )
          `)
          .eq('user_id', session.user.id);

        if (userOrgsError) {
          console.error('Error fetching organizations:', userOrgsError);
          throw userOrgsError;
        }

        console.log('Raw user organizations data:', userOrgs);

        const orgs = userOrgs
          ?.flatMap(uo => uo.organizations)
          .filter((org): org is Organization => org !== null)
          ?? [];

        console.log('Processed organizations:', orgs);
        
        setOrganizations(orgs);
        
        // If we have organizations but no current org selected, select the first one
        if (orgs.length > 0 && !currentOrg) {
          console.log('Setting initial organization:', orgs[0]);
          setCurrentOrg(orgs[0]);
        }
      } catch (error) {
        console.error('Error loading organizations:', error);
      } finally {
        setLoading(false);
      }
    }

    loadOrganizations();
  }, [session]); // Remove currentOrg from dependencies to prevent loops

  const value = {
    currentOrg,
    organizations,
    setCurrentOrg,
    loading
  };

  return (
    <OrgContext.Provider value={value}>
      {children}
    </OrgContext.Provider>
  );
}