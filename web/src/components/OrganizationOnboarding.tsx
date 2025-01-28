import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, Loader2 } from 'lucide-react';

export default function OrganizationOnboarding() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joiningOrg, setJoiningOrg] = useState<string | null>(null);

  const handleJoinOrganization = async (orgName: string) => {
    try {
      setLoading(true);
      setError(null);
      setJoiningOrg(orgName);

      // First, get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('No user found');

      // Get org info
      const { data: orgs, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('name', orgName)
        .limit(1);

      if (orgError) throw orgError;
      if (!orgs || orgs.length === 0) throw new Error('Organization not found');

      console.log('Found organization:', orgs[0]);

      // Add user to organization
      const { error: joinError } = await supabase
        .from('user_organizations')
        .insert({
          user_id: user.id,
          org_id: orgs[0].id,
          role: 'member'
        });

      if (joinError) throw joinError;

      // Force reload to refresh organization context
      window.location.reload();
    } catch (err) {
      console.error('Error joining organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to join organization');
    } finally {
      setLoading(false);
      setJoiningOrg(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <Building2 className="mx-auto h-12 w-12 text-indigo-600" />
          <h2 className="mt-6 text-3xl font-bold text-gray-900">Join an Organization</h2>
          <p className="mt-2 text-gray-600">
            Choose an organization to join and start managing files.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {['Org1', 'Org2'].map((org) => (
            <button
              key={org}
              onClick={() => handleJoinOrganization(org)}
              disabled={loading}
              className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <div className="flex items-center space-x-3">
                <Building2 className="h-5 w-5 text-gray-400" />
                <div className="text-left">
                  <div className="font-medium text-gray-900">{org}</div>
                  <div className="text-sm text-gray-500">Join as member</div>
                </div>
              </div>
              {loading && joiningOrg === org && (
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}