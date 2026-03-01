'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Download, ChevronDown, ChevronUp, FileJson } from 'lucide-react'
import { toast } from 'sonner'
import {
  convertMultipleTokensToTriples,
  downloadTriplesAsJSON,
  type Triple,
} from '@/lib/utils/triples-export'

interface TokenSummary {
  id: string
  name: string
  ticker: string
  chain?: string
  status: string
  completeness_score: number
  created_at: string
  updated_at: string
}

interface CompleteTokenData {
  token: TokenSummary
  supply?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  allocations: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  vesting: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  emission?: any // eslint-disable-line @typescript-eslint/no-explicit-any
  sources: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  risk_flags: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
}

export default function ExportPage() {
  const supabase = createClient()

  const [tokens, setTokens] = useState<TokenSummary[]>([])
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [generatedTriples, setGeneratedTriples] = useState<Triple[]>([])
  const [showPreview, setShowPreview] = useState(false)

  // Fetch all validated tokens
  useEffect(() => {
    const fetchTokens = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('tokens')
          .select('*')
          .eq('status', 'validated')
          .order('name', { ascending: true })

        if (error) {
          console.error('Error fetching tokens:', error)
          toast.error('Failed to load validated tokens')
          return
        }

        setTokens(data || [])
      } catch (err) {
        console.error('Unexpected error:', err)
        toast.error('Failed to load tokens')
      } finally {
        setLoading(false)
      }
    }

    fetchTokens()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle individual token selection
  const toggleToken = (tokenId: string) => {
    const newSelected = new Set(selectedTokenIds)
    if (newSelected.has(tokenId)) {
      newSelected.delete(tokenId)
    } else {
      newSelected.add(tokenId)
    }
    setSelectedTokenIds(newSelected)
    // Reset preview when selection changes
    setGeneratedTriples([])
    setShowPreview(false)
  }

  // Select all tokens
  const selectAll = () => {
    const allIds = new Set(tokens.map((t) => t.id))
    setSelectedTokenIds(allIds)
    // Reset preview when selection changes
    setGeneratedTriples([])
    setShowPreview(false)
  }

  // Deselect all tokens
  const deselectAll = () => {
    setSelectedTokenIds(new Set())
    setGeneratedTriples([])
    setShowPreview(false)
  }

  // Fetch complete data for selected tokens
  const fetchCompleteTokenData = async (tokenId: string): Promise<CompleteTokenData | null> => {
    try {
      // Fetch token
      const { data: tokenData, error: tokenError } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', tokenId)
        .single()

      if (tokenError || !tokenData) return null

      // Fetch supply metrics
      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      // Fetch allocations
      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)
        .order('percentage', { ascending: false })

      const allocationIds = allocData?.map((a) => a.id) || []

      // Fetch vesting schedules with allocation info
      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select(`
          *,
          allocation:allocation_segments!vesting_schedules_allocation_id_fkey(id, label, segment_type)
        `)
        .in('allocation_id', allocationIds.length > 0 ? allocationIds : [''])

      // Fetch emission model
      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      // Fetch data sources
      const { data: sourcesData } = await supabase
        .from('data_sources')
        .select('*')
        .eq('token_id', tokenId)

      // Fetch risk flags
      const { data: riskData } = await supabase
        .from('risk_flags')
        .select('*')
        .eq('token_id', tokenId)

      return {
        token: tokenData,
        supply: supplyData || undefined,
        allocations: allocData || [],
        vesting: vestingData || [],
        emission: emissionData || undefined,
        sources: sourcesData || [],
        risk_flags: riskData || [],
      }
    } catch (err) {
      console.error(`Error fetching data for token ${tokenId}:`, err)
      return null
    }
  }

  // Generate triples for selected tokens
  const generateTriples = async () => {
    if (selectedTokenIds.size === 0) return

    setExporting(true)
    try {
      const selectedTokensData: CompleteTokenData[] = []

      // Fetch complete data for each selected token
      for (const tokenId of Array.from(selectedTokenIds)) {
        const completeData = await fetchCompleteTokenData(tokenId)
        if (completeData) {
          selectedTokensData.push(completeData)
        }
      }

      // Convert to triples
      const triples = convertMultipleTokensToTriples(selectedTokensData)
      setGeneratedTriples(triples)
      setShowPreview(true)
      toast.success(`Generated ${triples.length} triples from ${selectedTokensData.length} token(s)`)
    } catch (err) {
      console.error('Error generating triples:', err)
      toast.error('Failed to generate triples')
    } finally {
      setExporting(false)
    }
  }

  // Download triples as JSON
  const handleDownload = () => {
    if (generatedTriples.length === 0) return

    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `trustnomiks-export-${timestamp}.json`
    downloadTriplesAsJSON(generatedTriples, filename)
  }

  const allSelected = tokens.length > 0 && selectedTokenIds.size === tokens.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Export to JSON Triples</h1>
        <p className="text-muted-foreground mt-2">
          Export validated tokens to Intuition Triples format for knowledge graph integration.
        </p>
      </div>

      <Separator />

      {/* Selection Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Select Tokens to Export</CardTitle>
          <CardDescription>
            Choose which validated tokens to include in the export. Only tokens with status
            &quot;validated&quot; are shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Select All / Deselect All */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={allSelected ? deselectAll : selectAll}
              disabled={tokens.length === 0}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedTokenIds.size} of {tokens.length} token(s) selected
            </span>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="py-8 text-center text-muted-foreground">Loading validated tokens...</div>
          )}

          {/* Empty State */}
          {!loading && tokens.length === 0 && (
            <div className="py-8 text-center">
              <FileJson className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No validated tokens found. Validate tokens from the dashboard to enable export.
              </p>
            </div>
          )}

          {/* Token List */}
          {!loading && tokens.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    id={token.id}
                    checked={selectedTokenIds.has(token.id)}
                    onCheckedChange={() => toggleToken(token.id)}
                  />
                  <label htmlFor={token.id} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{token.name}</span>
                      <Badge variant="secondary">{token.ticker}</Badge>
                      {token.chain && (
                        <Badge variant="outline" className="text-xs">
                          {token.chain}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Completeness: {token.completeness_score}%
                    </p>
                  </label>
                </div>
              ))}
            </div>
          )}

          {/* Generate Button */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={generateTriples}
              disabled={selectedTokenIds.size === 0 || exporting}
              className="flex-1"
            >
              <FileJson className="mr-2 h-4 w-4" />
              {exporting ? 'Generating Triples...' : 'Generate Triples Preview'}
            </Button>
            {generatedTriples.length > 0 && (
              <Button onClick={handleDownload} variant="default">
                <Download className="mr-2 h-4 w-4" />
                Download JSON
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Triples Preview */}
      {generatedTriples.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Generated Triples</CardTitle>
                <CardDescription>
                  {generatedTriples.length} triple{generatedTriples.length !== 1 ? 's' : ''}{' '}
                  generated from {selectedTokenIds.size} token
                  {selectedTokenIds.size !== 1 ? 's' : ''}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? (
                  <>
                    <ChevronUp className="mr-2 h-4 w-4" />
                    Hide Preview
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-2 h-4 w-4" />
                    Show Preview
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {showPreview && (
            <CardContent>
              <div className="rounded-lg bg-muted p-4 max-h-96 overflow-auto">
                <pre className="text-xs font-mono">
                  {JSON.stringify(generatedTriples, null, 2)}
                </pre>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  File size: {(JSON.stringify(generatedTriples).length / 1024).toFixed(2)} KB
                </p>
                <Button onClick={handleDownload} size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download JSON
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>About Intuition Triples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The Intuition Triples format represents tokenomics data as a knowledge graph using
            subject-predicate-object triples. Each triple encodes a single fact about a token.
          </p>
          <p className="font-mono text-xs bg-muted p-2 rounded">
            {'{ "subject": "ETH", "predicate": "has Max Supply", "object": "120000000" }'}
          </p>
          <p>
            This format enables semantic querying, data validation, and integration with other
            knowledge graphs and AI systems.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
