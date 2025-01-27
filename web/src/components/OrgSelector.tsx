"use client"

import React from "react"
import { useOrg } from "@/contexts/OrgContext"
import { Building2, ChevronDown } from "lucide-react"

export default function OrganizationSelector() {
  const { currentOrg, organizations, setCurrentOrg, loading } = useOrg()

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-gray-600 bg-gray-100 px-3 py-2 rounded-md">
        <Building2 size={18} />
        <span className="text-sm font-medium">Loading...</span>
      </div>
    )
  }

  if (!organizations.length) {
    return (
      <div className="flex items-center space-x-2 text-red-600 bg-red-100 px-3 py-2 rounded-md">
        <Building2 size={18} />
        <span className="text-sm font-medium">No organizations</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <select
        value={currentOrg?.id || ""}
        onChange={(e) => {
          const org = organizations.find((o) => o.id === e.target.value)
          if (org) setCurrentOrg(org)
        }}
        className="appearance-none bg-white text-gray-800 pl-10 pr-10 py-2 rounded-md border border-gray-300 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
    </div>
  )
}