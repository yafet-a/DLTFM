'use client';

import React from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { Building2, ChevronDown } from 'lucide-react';

export default function OrganizationSelector() {
  const { currentOrg, organizations, setCurrentOrg, loading } = useOrg();

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-gray-600 bg-gray-100/80 px-3 py-1.5 rounded-full animate-pulse">
        <Building2 size={16} />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (!organizations.length) {
    return (
      <div className="flex items-center space-x-2 text-red-600 bg-red-100 px-3 py-1.5 rounded-full">
        <Building2 size={16} />
        <span className="text-sm">No organizations</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={currentOrg?.id || ''}
        onChange={(e) => {
          const org = organizations.find(o => o.id === e.target.value);
          if (org) setCurrentOrg(org);
        }}
        className="appearance-none bg-blue-700/40 text-white pl-8 pr-8 py-1.5 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id} className="text-gray-900 bg-white">
            {org.name}
          </option>
        ))}
      </select>
      <Building2 size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-200" />
      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-200" />
    </div>
  );
}