"use client"

import type React from "react"
import { Hash, User, FileText, ArrowLeftRight, RotateCcw } from "lucide-react"
import type { File as BlockchainFile } from "@/types/file";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Copy } from "lucide-react"
import { format } from "date-fns"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface VersionHistorySheetProps {
  file: BlockchainFile
  versions: BlockchainFile[]
  open: boolean
  onClose: () => void
}

const VersionHistorySheet: React.FC<VersionHistorySheetProps> = ({ file, versions, open, onClose }) => {
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version)

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] sm:h-[80vh] sm:max-w-4xl sm:mx-auto rounded-t-xl">
        <SheetHeader className="border-b pb-4 mb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <span className="font-semibold">Version History</span>
            <Badge variant="outline" className="ml-2">
              {file.name}
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100%-5rem)]">
          <div className="space-y-6 pr-4">
            {sortedVersions.map((version, index) => (
            //   <div key={version.id} className="flex items-start gap-4">
                <div
                key={version.id}
                className="flex items-start gap-4 p-4 border rounded-lg bg-white/70"
                >
                {/* <Avatar className="mt-1">
                  <AvatarImage src={version.avatar} />
                  <AvatarFallback>{version.owner.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar> */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Version {version.version}</span>
                      {index === 0 && (
                        // <Badge variant="default" className="rounded-md">
                        //   Latest
                        // </Badge>
                        <Badge variant="default" className="rounded-md text-sm px-2 py-1">
                            Latest Version
                        </Badge>
                      )}
                    </div>
                    <time className="text-xs text-gray-500">
                        {format(new Date(version.timestamp), "PPpp")}
                    </time>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{version.owner}</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center gap-2 text-sm">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        <code className="font-mono text-xs">
                            {version.hash.slice(0, 30)}...
                        </code>

                        <TooltipProvider>
                          <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(version.hash)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Copy full hash</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        </div>
                  </div>
                  <div className="flex gap-2">
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon">
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Restore this version</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon">
                            <ArrowLeftRight className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Compare with current version</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

export default VersionHistorySheet

