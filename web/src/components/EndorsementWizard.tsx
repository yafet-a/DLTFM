"use client"

import React, { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Check, ChevronsUpDown, Shield } from "lucide-react"
// import { AnimatedBeam } from "@/components/magicui/animated-beam"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useOrg } from "@/contexts/OrgContext"

interface EndorsementWizardProps {
    onSubmit: (config: {
        policyType: string;
        requiredOrgs: string[];
    }) => void;
    onCancel: () => void;
}

const policyOptions = [
    {
        value: "ALL_ORGS",
        label: "All Organizations Must Approve",
    },
    {
        value: "ANY_ORG",
        label: "Any Organization Can Approve",
    },
    {
        value: "SPECIFIC_ORGS",
        label: "Specific Organizations",
    },
];

export function EndorsementWizard({ onSubmit, onCancel }: EndorsementWizardProps) {
    const { currentOrg } = useOrg();

    // Create refs for AnimatedBeam
    const containerRef = useRef<HTMLDivElement>(null);
    //   const startRef = useRef<HTMLDivElement>(null);
    //   const endRef = useRef<HTMLDivElement>(null);

    const [config, setConfig] = useState({
        policyType: "ALL_ORGS",
        requiredOrgs: [] as string[],
    })

    const [openPolicyCombo, setOpenPolicyCombo] = React.useState(false);


    return (
        <Card className="w-full relative overflow-hidden">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Endorsement Configuration
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Policy Type Selection as Combobox */}
                <div className="space-y-4">
                    <Label className="block text-sm font-medium text-gray-700">Policy Type:</Label>
                    <Popover open={openPolicyCombo} onOpenChange={setOpenPolicyCombo}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openPolicyCombo}
                                className="w-full justify-between"
                            >
                                {
                                    policyOptions.find((opt) => opt.value === config.policyType)?.label ||
                                    "Select Policy"
                                }
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0">
                            <Command>
                                <CommandInput placeholder="Search policy..." />
                                <CommandList>
                                    <CommandEmpty>No matching policy.</CommandEmpty>
                                    <CommandGroup>
                                        {policyOptions.map((option) => (
                                            <CommandItem
                                                key={option.value}
                                                onSelect={() => {
                                                    setConfig({
                                                        ...config,
                                                        policyType: option.value,
                                                        requiredOrgs: [],
                                                    });
                                                    setOpenPolicyCombo(false);
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <Check
                                                    className={`mr-2 h-4 w-4 ${config.policyType === option.value ? "opacity-100" : "opacity-0"
                                                        }`}
                                                />
                                                {option.label}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Organization Selection (only show for SPECIFIC_ORGS) */}
                {config.policyType === "SPECIFIC_ORGS" && (
                    <div className="space-y-4">
                        <Label>Required Organizations:</Label>
                        <div className="space-y-2 border rounded-md p-4">
                            {/* Always include current org */}
                            <div className="flex items-center">
                                <Checkbox id="current-org" checked disabled />
                                <Label htmlFor="current-org" className="ml-2">
                                    {currentOrg?.name || "Current Organization"} (You)
                                </Label>
                            </div>
                            {/* Example additional organization */}
                            <div className="flex items-center">
                                <Checkbox
                                    id="org2"
                                    checked={config.requiredOrgs.includes("Org2MSP")}
                                    onCheckedChange={(checked) => {
                                        const newOrgs = checked
                                            ? [...config.requiredOrgs, "Org2MSP"]
                                            : config.requiredOrgs.filter((org) => org !== "Org2MSP");
                                        setConfig({ ...config, requiredOrgs: newOrgs });
                                    }}
                                />
                                <Label htmlFor="org2" className="ml-2">
                                    Organization 2
                                </Label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Help text based on selection */}
                <div className="bg-blue-50 rounded-md p-4">
                    <p className="text-sm text-blue-700">
                        {config.policyType === "ALL_ORGS" &&
                            "All organizations in the network must approve this file before it becomes valid."}
                        {config.policyType === "ANY_ORG" &&
                            "Any organization in the network can approve this file to make it valid."}
                        {config.policyType === "SPECIFIC_ORGS" &&
                            "Only the selected organizations will be required to approve this file."}
                    </p>
                </div>
            </CardContent>

            <CardFooter className="flex justify-between">
                <Button variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    onClick={() => {
                        let finalRequiredOrgs: string[] = [];
                        switch (config.policyType) {
                            case "ALL_ORGS":
                                finalRequiredOrgs = [currentOrg?.fabric_msp_id || "Org1MSP", "Org2MSP"];
                                break;
                            case "ANY_ORG":
                                finalRequiredOrgs = [currentOrg?.fabric_msp_id || "Org1MSP"];
                                break;
                            case "SPECIFIC_ORGS":
                                finalRequiredOrgs = [currentOrg?.fabric_msp_id || "Org1MSP", ...config.requiredOrgs];
                                break;
                        }
                        onSubmit({
                            policyType: config.policyType,
                            requiredOrgs: finalRequiredOrgs,
                        });
                    }}
                >
                    Configure Endorsement
                </Button>
            </CardFooter>
        </Card>
    );
}