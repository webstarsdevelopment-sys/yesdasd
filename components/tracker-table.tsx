"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import Image from "next/image"
import { Search, RefreshCw, Phone, AlertCircle, Loader2, Settings, Link2, Check, Moon, Sun, PhoneCall, PhoneMissed, PhoneOff, Copy, Plus, Trash2, FileSpreadsheet, X, StickyNote, WifiOff, Filter } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useTheme } from "next-themes"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type CallStatus = "not_called" | "called" | "tried" | "no_answer" | "callback"

interface Lead {
  id: string
  name: string
  phone: string
  email: string
  type: string
  address: string
  rep: string
  calls: number
  notes: string
}

interface CallStatusRecord {
  [leadId: string]: CallStatus
}

interface NotesRecord {
  [leadId: string]: string
}

interface Sheet {
  id: string
  label: string
  url: string
}

interface LeadsResponse {
  leads: Lead[]
  lastUpdated: string
  error?: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const SHEETS_KEY = "google-sheets-list"
const ACTIVE_SHEET_KEY = "active-sheet-id"
const CALL_STATUS_KEY = "lead-call-status"
const NOTES_KEY = "lead-notes"
const FILTER_DUPLICATES_KEY = "filter-duplicates"

const CALL_STATUS_OPTIONS: { value: CallStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "not_called", label: "Not Called", icon: <Phone className="h-4 w-4" />, color: "text-muted-foreground" },
  { value: "called", label: "Called", icon: <PhoneCall className="h-4 w-4" />, color: "text-green-500" },
  { value: "tried", label: "Tried to Call", icon: <PhoneMissed className="h-4 w-4" />, color: "text-yellow-500" },
  { value: "no_answer", label: "No Answer", icon: <PhoneOff className="h-4 w-4" />, color: "text-red-500" },
  { value: "callback", label: "Callback", icon: <Phone className="h-4 w-4" />, color: "text-blue-500" },
]

export function TrackerTable() {
  const [searchTerm, setSearchTerm] = useState("")
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null)
  const [inputUrl, setInputUrl] = useState("")
  const [inputLabel, setInputLabel] = useState("")
  const [showSettings, setShowSettings] = useState(true)
  const [callStatuses, setCallStatuses] = useState<CallStatusRecord>({})
  const [notes, setNotes] = useState<NotesRecord>({})
  const [filterDuplicates, setFilterDuplicates] = useState(true)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState("")
  const [statusFilter, setStatusFilter] = useState<CallStatus | "all">("all")

  // Mount state for hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load saved sheets and settings from localStorage on mount
  useEffect(() => {
    const savedSheets = localStorage.getItem(SHEETS_KEY)
    if (savedSheets) {
      const parsedSheets = JSON.parse(savedSheets) as Sheet[]
      setSheets(parsedSheets)
      
      const savedActiveId = localStorage.getItem(ACTIVE_SHEET_KEY)
      if (savedActiveId && parsedSheets.find(s => s.id === savedActiveId)) {
        setActiveSheetId(savedActiveId)
        setShowSettings(false)
      } else if (parsedSheets.length > 0) {
        setActiveSheetId(parsedSheets[0].id)
        setShowSettings(false)
      }
    }
    
    const savedStatuses = localStorage.getItem(CALL_STATUS_KEY)
    if (savedStatuses) {
      setCallStatuses(JSON.parse(savedStatuses))
    }
    
    const savedNotes = localStorage.getItem(NOTES_KEY)
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes))
    }
    
    const savedFilterDuplicates = localStorage.getItem(FILTER_DUPLICATES_KEY)
    if (savedFilterDuplicates !== null) {
      setFilterDuplicates(savedFilterDuplicates === "true")
    }
  }, [])

  // Get active sheet
  const activeSheet = sheets.find(s => s.id === activeSheetId)
  
  // Build the API URL with the sheet URL as a query parameter
  const apiUrl = activeSheet ? `/api/leads?sheetUrl=${encodeURIComponent(activeSheet.url)}` : null
  
  // SWR for live updates - refreshes every 5 seconds for all viewers
  const { data, error, isLoading, isValidating, mutate } = useSWR<LeadsResponse>(
    apiUrl,
    fetcher,
    {
      refreshInterval: 5000, // Refresh every 5 seconds for real-time sync
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      revalidateIfStale: true,
      dedupingInterval: 2000,
    }
  )

  // Track connectivity status for live indicator (initialize false to avoid hydration mismatch)
  const [isLive, setIsLive] = useState(false)

  // Set live status after mount and handle connectivity changes
  useEffect(() => {
    // Set initial online status after mount
    setIsLive(navigator.onLine)

    const handleOnline = () => {
      setIsLive(true)
      mutate() // Immediately sync when coming back online
    }
    const handleOffline = () => setIsLive(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Also handle visibility change to sync when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        mutate() // Sync when tab becomes visible
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [mutate])

  const handleAddSheet = () => {
    if (inputUrl.trim()) {
      const newSheet: Sheet = {
        id: `sheet-${Date.now()}`,
        label: inputLabel.trim() || `Sheet ${sheets.length + 1}`,
        url: inputUrl.trim(),
      }
      const newSheets = [...sheets, newSheet]
      setSheets(newSheets)
      setActiveSheetId(newSheet.id)
      localStorage.setItem(SHEETS_KEY, JSON.stringify(newSheets))
      localStorage.setItem(ACTIVE_SHEET_KEY, newSheet.id)
      setInputUrl("")
      setInputLabel("")
      setShowSettings(false)
    }
  }

  const handleRemoveSheet = (sheetId: string) => {
    const newSheets = sheets.filter(s => s.id !== sheetId)
    setSheets(newSheets)
    localStorage.setItem(SHEETS_KEY, JSON.stringify(newSheets))
    
    if (activeSheetId === sheetId) {
      const newActiveId = newSheets.length > 0 ? newSheets[0].id : null
      setActiveSheetId(newActiveId)
      if (newActiveId) {
        localStorage.setItem(ACTIVE_SHEET_KEY, newActiveId)
      } else {
        localStorage.removeItem(ACTIVE_SHEET_KEY)
        setShowSettings(true)
      }
    }
  }

  const handleSelectSheet = (sheetId: string) => {
    setActiveSheetId(sheetId)
    localStorage.setItem(ACTIVE_SHEET_KEY, sheetId)
  }

  const updateCallStatus = (leadId: string, status: CallStatus) => {
    const newStatuses = { ...callStatuses, [leadId]: status }
    setCallStatuses(newStatuses)
    localStorage.setItem(CALL_STATUS_KEY, JSON.stringify(newStatuses))
  }

  const toggleFilterDuplicates = () => {
    const newValue = !filterDuplicates
    setFilterDuplicates(newValue)
    localStorage.setItem(FILTER_DUPLICATES_KEY, String(newValue))
  }

  const getCallStatus = (leadId: string): CallStatus => {
    return callStatuses[leadId] || "not_called"
  }

  const getStatusOption = (status: CallStatus) => {
    return CALL_STATUS_OPTIONS.find(opt => opt.value === status) || CALL_STATUS_OPTIONS[0]
  }

  const getLeadNote = (leadId: string): string => {
    return notes[leadId] || ""
  }

  const saveNote = (leadId: string, text: string) => {
    const newNotes = { ...notes, [leadId]: text }
    setNotes(newNotes)
    localStorage.setItem(NOTES_KEY, JSON.stringify(newNotes))
  }

  const openNoteEditor = (leadId: string) => {
    setEditingNoteId(leadId)
    setNoteText(getLeadNote(leadId))
  }

  const closeNoteEditor = () => {
    if (editingNoteId) {
      saveNote(editingNoteId, noteText)
    }
    setEditingNoteId(null)
    setNoteText("")
  }

  const leads = data?.leads || []
  const lastUpdated = data?.lastUpdated

  // Filter duplicates by phone number (keep first occurrence)
  const deduplicatedLeads = filterDuplicates
    ? leads.filter((lead, index, self) => {
        if (!lead.phone) return true // Keep leads without phone
        const normalizedPhone = lead.phone.replace(/\D/g, "") // Remove non-digits
        return index === self.findIndex(l => l.phone.replace(/\D/g, "") === normalizedPhone)
      })
    : leads

  const duplicateCount = leads.length - deduplicatedLeads.length

  // Filter leads based on search term and status filter
  const filteredLeads = deduplicatedLeads.filter((lead) => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = (
      lead.name.toLowerCase().includes(searchLower) ||
      lead.phone.toLowerCase().includes(searchLower) ||
      lead.email.toLowerCase().includes(searchLower) ||
      lead.type.toLowerCase().includes(searchLower) ||
      lead.address.toLowerCase().includes(searchLower) ||
      lead.rep.toLowerCase().includes(searchLower)
    )
    const matchesStatus = statusFilter === "all" || getCallStatus(lead.id) === statusFilter
    return matchesSearch && matchesStatus
  })

  const getTypeBadgeVariant = (type: string) => {
    const typeLower = type.toLowerCase()
    if (typeLower.includes("hot") || typeLower.includes("qualified")) return "default"
    if (typeLower.includes("warm")) return "secondary"
    if (typeLower.includes("cold")) return "outline"
    return "secondary"
  }

  const formatLastUpdated = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo-avVA9aj7vyIy3uj0DpcftVTAENvUps.png"
              alt="Automate Effect"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <div>
              <h1 className="text-lg font-semibold text-foreground">Cold Calling Tracker</h1>
              <p className="text-xs text-muted-foreground">Live from Google Sheets</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Live sync indicator */}
            {mounted && activeSheet && (
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
                  isLive && !error
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                )}>
                  {isLive && !error ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                      </span>
                      <span className="hidden sm:inline">Live</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3" />
                      <span className="hidden sm:inline">Offline</span>
                    </>
                  )}
                </div>
                {isValidating && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            )}
            {lastUpdated && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                Updated: {formatLastUpdated(lastUpdated)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => mutate()}
              disabled={isValidating || !activeSheet}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isValidating && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant={showSettings ? "default" : "ghost"}
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            {mounted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="gap-2"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container px-4 py-4">
        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-4 rounded-lg border bg-card p-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Manage Google Sheets</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Add multiple Google Sheets with labels. Make sure each sheet is published to the web
                  (File &gt; Share &gt; Publish to web).
                </p>
                
                {/* Existing Sheets */}
                {sheets.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <p className="text-sm font-medium text-foreground">Your Sheets</p>
                    {sheets.map((sheet) => (
                      <div
                        key={sheet.id}
                        className={cn(
                          "flex items-center gap-3 rounded-md border p-3 transition-colors",
                          activeSheetId === sheet.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        )}
                      >
                        <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <button
                          onClick={() => handleSelectSheet(sheet.id)}
                          className="flex-1 text-left"
                        >
                          <p className="font-medium text-foreground">{sheet.label}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{sheet.url}</p>
                        </button>
                        {activeSheetId === sheet.id && (
                          <Badge variant="default" className="shrink-0">Active</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSheet(sheet.id)}
                          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Add New Sheet */}
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <p className="text-sm font-medium text-foreground">
                    <Plus className="mr-1 inline h-4 w-4" />
                    Add New Sheet
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Label (e.g. Hot Leads)"
                      value={inputLabel}
                      onChange={(e) => setInputLabel(e.target.value)}
                      className="w-40"
                    />
                    <Input
                      placeholder="https://docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      className="flex-1 font-mono text-sm"
                    />
                    <Button onClick={handleAddSheet} disabled={!inputUrl.trim()} className="gap-2">
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
                
                <p className="mt-2 text-xs text-muted-foreground">
                  Expected columns: Name, Phone, Email, Type, Address (and optionally Rep, Calls, Notes)
                </p>
                
                <div className="mt-4 flex items-center gap-3 border-t pt-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={filterDuplicates}
                      onChange={toggleFilterDuplicates}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-sm font-medium">Filter duplicate phone numbers</span>
                  </label>
                  {duplicateCount > 0 && filterDuplicates && (
                    <Badge variant="secondary" className="gap-1">
                      <Copy className="h-3 w-3" />
                      {duplicateCount} duplicates hidden
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Sheet Tabs - Browse between sheets */}
        {sheets.length > 1 && !showSettings && (
          <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1">
            {sheets.map((sheet) => (
              <Button
                key={sheet.id}
                variant={activeSheetId === sheet.id ? "default" : "outline"}
                size="sm"
                onClick={() => handleSelectSheet(sheet.id)}
                className="shrink-0 gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {sheet.label}
              </Button>
            ))}
          </div>
        )}

        {/* Search Bar & Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          {/* Status Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                {statusFilter === "all" ? (
                  <>
                    <Filter className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">All Status</span>
                  </>
                ) : (
                  <>
                    <span className={getStatusOption(statusFilter).color}>
                      {getStatusOption(statusFilter).icon}
                    </span>
                    <span className="hidden sm:inline">{getStatusOption(statusFilter).label}</span>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter("all")} className="gap-2">
                <Filter className="h-4 w-4" />
                All Status
                {statusFilter === "all" && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              {CALL_STATUS_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={cn("gap-2", option.color)}
                >
                  {option.icon}
                  {option.label}
                  {statusFilter === option.value && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="h-6 whitespace-nowrap text-xs">
              {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}
            </Badge>
            {mounted && activeSheet && (
              <>
                <Badge variant="outline" className="hidden h-6 gap-1 text-xs text-green-500 sm:flex">
                  <PhoneCall className="h-3 w-3" />
                  {filteredLeads.filter(l => getCallStatus(l.id) === "called").length}
                </Badge>
                <Badge variant="outline" className="hidden h-6 gap-1 text-xs text-yellow-500 sm:flex">
                  <PhoneMissed className="h-3 w-3" />
                  {filteredLeads.filter(l => getCallStatus(l.id) === "tried" || getCallStatus(l.id) === "no_answer").length}
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Failed to load leads</p>
              <p className="text-sm opacity-80">
                {error.message || "Please check your Google Sheet ID and try again."}
              </p>
            </div>
          </div>
        )}

        {/* No Sheet Connected State */}
        {!activeSheet && !showSettings && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4">
              <Link2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">No Google Sheet connected</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
              className="mt-4"
            >
              Connect Sheet
            </Button>
          </div>
        )}

        {/* Loading State */}
        {activeSheet && isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading leads from Google Sheets...</p>
          </div>
        )}

        {/* Data Error from API */}
        {data?.error && !isLoading && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Configuration Error</p>
              <p className="text-sm opacity-80">{data.error}</p>
            </div>
          </div>
        )}

        {/* Table */}
        {activeSheet && !isLoading && !data?.error && (
          <div className="overflow-x-auto rounded-md border bg-card">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[120px]">Name</TableHead>
                  <TableHead className="w-[100px]">Phone</TableHead>
                  <TableHead className="hidden w-[140px] md:table-cell">Email</TableHead>
                  <TableHead className="w-[60px]">Type</TableHead>
                  <TableHead className="hidden w-[120px] lg:table-cell">Address</TableHead>
                  <TableHead className="hidden w-[50px] sm:table-cell">Rep</TableHead>
                  <TableHead className="w-[30px] text-center">#</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="hidden w-[100px] xl:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-muted-foreground">
                          {searchTerm ? "No leads match your search" : "No leads found in the Google Sheet"}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="overflow-hidden"><span className="block truncate font-medium">{lead.name}</span></TableCell>
                      <TableCell className="overflow-hidden">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="block truncate text-primary hover:underline">{lead.phone}</a>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="hidden overflow-hidden md:table-cell">
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="block truncate text-primary hover:underline">{lead.email}</a>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="overflow-hidden">
                        {lead.type ? (
                          <Badge variant={getTypeBadgeVariant(lead.type)} className="h-5 max-w-full truncate px-1.5 text-[10px]">{lead.type}</Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="hidden overflow-hidden lg:table-cell"><span className="block truncate">{lead.address || "-"}</span></TableCell>
                      <TableCell className="hidden overflow-hidden sm:table-cell"><span className="block truncate">{lead.rep || "-"}</span></TableCell>
                      <TableCell className="overflow-hidden text-center text-xs text-muted-foreground">{lead.calls}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("h-6 gap-1 px-1.5 text-xs", getStatusOption(getCallStatus(lead.id)).color)}
                            >
                              {getStatusOption(getCallStatus(lead.id)).icon}
                              <span className="hidden sm:inline">{getStatusOption(getCallStatus(lead.id)).label}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {CALL_STATUS_OPTIONS.map((option) => (
                              <DropdownMenuItem
                                key={option.value}
                                onClick={() => updateCallStatus(lead.id, option.value)}
                                className={cn("gap-2 text-sm", option.color)}
                              >
                                {option.icon}
                                {option.label}
                                {getCallStatus(lead.id) === option.value && <Check className="ml-auto h-4 w-4" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <Dialog open={editingNoteId === lead.id} onOpenChange={(open) => { if (!open) closeNoteEditor() }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openNoteEditor(lead.id)}
                              className={cn(
                                "h-6 max-w-[120px] justify-start gap-1 truncate px-1.5 text-left text-xs",
                                (getLeadNote(lead.id) || lead.notes) ? "text-foreground" : "text-muted-foreground"
                              )}
                            >
                              <StickyNote className="h-3 w-3 shrink-0" />
                              <span className="truncate">{getLeadNote(lead.id) || lead.notes || "Note..."}</span>
                            </Button>
                          </DialogTrigger>
<DialogContent aria-describedby={undefined}>
                          <DialogHeader>
                            <DialogTitle>Notes for {lead.name}</DialogTitle>
                          </DialogHeader>
                            <div className="space-y-4">
                              {lead.notes && (
                                <div className="rounded-md bg-muted p-3">
                                  <p className="mb-1 text-xs font-medium text-muted-foreground">From Sheet:</p>
                                  <p className="text-sm">{lead.notes}</p>
                                </div>
                              )}
                              <div>
                                <p className="mb-2 text-sm font-medium">Your Notes:</p>
                                <Textarea
                                  placeholder="Add your notes here..."
                                  value={noteText}
                                  onChange={(e) => setNoteText(e.target.value)}
                                  className="min-h-[120px]"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={closeNoteEditor}>
                                  Save & Close
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Live indicator */}
        {activeSheet && !isLoading && !error && !data?.error && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
            </span>
            Live updates every 5 seconds
          </div>
        )}
      </main>
    </div>
  )
}
