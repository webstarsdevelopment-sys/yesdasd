import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sheetUrl = searchParams.get("sheetUrl")
    
    // Extract sheet ID from various Google Sheets URL formats
    let sheetId: string | null = null
    
    if (sheetUrl) {
      // Handle pubhtml format: https://docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml
      const pubMatch = sheetUrl.match(/\/spreadsheets\/d\/e\/([^/]+)/)
      if (pubMatch) {
        sheetId = pubMatch[1]
      }
      
      // Handle regular format: https://docs.google.com/spreadsheets/d/SHEET_ID/...
      if (!sheetId) {
        const regularMatch = sheetUrl.match(/\/spreadsheets\/d\/([^/]+)/)
        if (regularMatch) {
          sheetId = regularMatch[1]
        }
      }
      
      // Handle just the ID
      if (!sheetId && !sheetUrl.includes("/")) {
        sheetId = sheetUrl
      }
    }
    
    // Fall back to environment variable
    if (!sheetId) {
      sheetId = process.env.GOOGLE_SHEET_ID || null
    }
    
    if (!sheetId) {
      return NextResponse.json(
        { error: "Please enter your Google Sheet URL above to get started" },
        { status: 400 }
      )
    }

    // Fetch data from Google Sheets
    // For published sheets (2PACX-...), use CSV export
    // For regular sheets, use the gviz JSON endpoint
    const isPublishedId = sheetId.startsWith("2PACX")
    const fetchUrl = isPublishedId
      ? `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?output=csv`
      : `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`
    
    const response = await fetch(fetchUrl, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch Google Sheet: ${response.statusText}`)
    }

    const text = await response.text()
    
    let headers: string[] = []
    let dataRows: string[][] = []
    
    if (isPublishedId) {
      // Parse CSV format for published sheets
      const lines = text.split("\n").filter(line => line.trim())
      if (lines.length === 0) {
        throw new Error("Empty spreadsheet")
      }
      
      // Parse CSV properly (handle quoted fields)
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = []
        let current = ""
        let inQuotes = false
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (char === "," && !inQuotes) {
            result.push(current.trim())
            current = ""
          } else {
            current += char
          }
        }
        result.push(current.trim())
        return result
      }
      
      headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
      dataRows = lines.slice(1).map(line => parseCSVLine(line))
    } else {
      // Parse JSON format for regular sheets
      const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/)
      
      if (!jsonMatch) {
        throw new Error("Invalid response format from Google Sheets")
      }

      const data = JSON.parse(jsonMatch[1])
      const rows = data.table.rows || []
      const cols = data.table.cols || []
      
      headers = cols.map((col: { label?: string }) => 
        (col.label || "").toLowerCase().trim()
      )
      
      dataRows = rows.map((row: { c: Array<{ v?: string | number | null }> }) => {
        const cells = row.c || []
        return cells.map((cell: { v?: string | number | null }) => String(cell?.v ?? ""))
      })
    }
    
    // Map column indices
    const nameIdx = headers.findIndex((h: string) => h.includes("name"))
    const phoneIdx = headers.findIndex((h: string) => h.includes("phone"))
    const emailIdx = headers.findIndex((h: string) => h.includes("email"))
    const typeIdx = headers.findIndex((h: string) => h.includes("type"))
    const addressIdx = headers.findIndex((h: string) => h.includes("address"))
    const repIdx = headers.findIndex((h: string) => h.includes("rep"))
    const callsIdx = headers.findIndex((h: string) => h.includes("call"))
    const notesIdx = headers.findIndex((h: string) => h.includes("note"))

    // Convert rows to lead objects
    const leads: Lead[] = dataRows
      .map((row: string[], index: number) => {
        const getValue = (idx: number): string => {
          if (idx === -1 || !row[idx]) return ""
          return String(row[idx] ?? "")
        }
        const getNumber = (idx: number): number => {
          if (idx === -1 || !row[idx]) return 0
          return parseInt(String(row[idx] ?? 0), 10) || 0
        }

        const name = getValue(nameIdx)
        if (!name) return null // Skip empty rows

        return {
          id: `sheet-${index}`,
          name,
          phone: getValue(phoneIdx),
          email: getValue(emailIdx),
          type: getValue(typeIdx),
          address: getValue(addressIdx),
          rep: getValue(repIdx),
          calls: getNumber(callsIdx),
          notes: getValue(notesIdx),
        }
      })
      .filter((lead: Lead | null): lead is Lead => lead !== null)

    // Return with cache-control headers to prevent browser/CDN caching
    return NextResponse.json(
      { leads, lastUpdated: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    )
  } catch (error) {
    console.error("Error fetching leads from Google Sheets:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch leads" },
      { status: 500 }
    )
  }
}
