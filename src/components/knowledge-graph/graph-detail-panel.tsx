'use client'

import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ExternalLink } from 'lucide-react'
import type { GraphNode, GraphEdge } from '@/lib/knowledge-graph/graph-types'
import { NODE_CONFIG } from '@/lib/knowledge-graph/node-config'

interface GraphDetailPanelProps {
  node: GraphNode | null
  edges: GraphEdge[]
  nodes: GraphNode[]
  onClose: () => void
  onNavigate: (nodeId: string) => void
}

export function GraphDetailPanel({ node, edges, nodes, onClose, onNavigate }: GraphDetailPanelProps) {
  if (!node) return null

  const config = NODE_CONFIG[node.type] ?? NODE_CONFIG.token
  const connected = getConnectedNodes(node.id, edges, nodes)

  return (
    <Sheet open={!!node} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="sm:max-w-sm overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
            <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
            <Badge variant="secondary" className="text-[10px]">{node.family}</Badge>
          </div>
          <SheetTitle className="text-lg">{node.label}</SheetTitle>
          <SheetDescription className="text-xs font-mono break-all">{node.id}</SheetDescription>
        </SheetHeader>

        {/* Parent chain — show human-readable parent entities */}
        {node.type !== 'graph_root' && node.type !== 'triple' && (() => {
          const parents = findParentEntities(node.id, edges, nodes)
          if (parents.length === 0) return null
          return (
            <div className="space-y-1 pb-1">
              {parents.map(({ entity, predicate }) => {
                const pConfig = NODE_CONFIG[entity.type] ?? NODE_CONFIG.token
                return (
                  <button
                    key={entity.id}
                    type="button"
                    onClick={() => onNavigate(entity.id)}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pConfig.color }} />
                    <span className="text-muted-foreground shrink-0">{predicate}</span>
                    <span className="font-medium truncate">{entity.label}</span>
                  </button>
                )
              })}
            </div>
          )
        })()}

        <Separator className="my-3" />

        {/* Triple-specific: show subject/predicate/object */}
        {node.type === 'triple' && (
          <div className="space-y-2 pb-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Triple structure</h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subject</span>
                <span className="font-mono text-right break-all max-w-[200px]">
                  {String(node.metadata.subject_id ?? '')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Predicate</span>
                <span className="font-medium">{String(node.metadata.predicate ?? '')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Object</span>
                <span className="font-mono text-right break-all max-w-[200px]">
                  {String(node.metadata.object_id ?? node.metadata.object_literal ?? '')}
                </span>
              </div>
            </div>
            <Separator className="my-2" />
          </div>
        )}

        {/* Properties */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Properties</h4>
          <PropertyList node={node} />
        </div>

        {/* Canonical Facts — literal triples describing this atom */}
        {node.type !== 'triple' && node.type !== 'graph_root' && (() => {
          const facts = connected
            .filter((c) => c.direction === 'in' && c.predicate === 'subject' && c.node.isLiteral)
          if (facts.length === 0) return null
          return (
            <>
              <Separator className="my-3" />
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Canonical Facts ({facts.length})
                </h4>
                <div className="space-y-1">
                  {facts.map(({ node: factNode }) => (
                    <button
                      key={factNode.id}
                      type="button"
                      onClick={() => onNavigate(factNode.id)}
                      className="w-full flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {String(factNode.metadata.predicate ?? factNode.label)}
                      </span>
                      <span className="font-medium text-right break-all">
                        {String(factNode.metadata.object_literal ?? '')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )
        })()}

        {/* Token link */}
        {node.type === 'token' && node.tokenId && (
          <>
            <Separator className="my-3" />
            <Link
              href={`/tokens/${node.tokenId}`}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View token detail
              <ExternalLink className="h-3 w-3" />
            </Link>
          </>
        )}

        {/* Provenance — sources that justify this triple */}
        {node.type === 'triple' && (() => {
          const justifiers = connected.filter(
            (c) => c.predicate === 'justified_by' || c.predicate.startsWith('attests'),
          )
          if (justifiers.length === 0) return null
          return (
            <>
              <Separator className="my-3" />
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Provenance ({justifiers.length})
                </h4>
                <div className="space-y-1">
                  {justifiers.map(({ node: srcNode, predicate: pLabel }) => {
                    const srcConfig = NODE_CONFIG[srcNode.type] ?? NODE_CONFIG.token
                    return (
                      <button
                        key={srcNode.id}
                        type="button"
                        onClick={() => onNavigate(srcNode.id)}
                        className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: srcConfig.color }} />
                        <span className="truncate flex-1">{srcNode.label}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{pLabel}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )
        })()}

        {/* Connected nodes */}
        {connected.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Connected to ({connected.length})
              </h4>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {connected.map(({ node: connNode, predicate, direction }) => {
                  const connConfig = NODE_CONFIG[connNode.type] ?? NODE_CONFIG.token
                  return (
                    <button
                      key={`${connNode.id}-${predicate}-${direction}`}
                      type="button"
                      onClick={() => onNavigate(connNode.id)}
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: connConfig.color }} />
                      <span className="truncate flex-1">{connNode.label}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {direction === 'out' ? '→' : '←'} {predicate}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function PropertyList({ node }: { node: GraphNode }) {
  // For triple nodes, skip the structural keys (already shown above)
  const skipKeys = node.type === 'triple'
    ? new Set(['predicate', 'subject_id', 'object_id', 'object_literal'])
    : new Set<string>()

  const entries = Object.entries(node.metadata).filter(
    ([k, v]) => v !== null && v !== undefined && v !== '' && !skipKeys.has(k),
  )

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No properties</p>
  }

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start justify-between gap-2 text-xs">
          <span className="text-muted-foreground shrink-0">{key}</span>
          <span className="font-medium text-right break-all">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Find parent entities of an atom node by traversing the reified triple chain:
 *   this_atom <--object_of-- triple_node --subject_of--> parent_atom
 * Returns the parent atoms with the triple's predicate as context label.
 */
function findParentEntities(
  nodeId: string,
  edges: GraphEdge[],
  nodes: GraphNode[],
): { entity: GraphNode; predicate: string }[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const results: { entity: GraphNode; predicate: string }[] = []

  // Step 1: find triple nodes pointing to this atom via object_of
  // edge pattern: triple --object_of--> this_atom
  const tripleIds: string[] = []
  for (const e of edges) {
    if (e.target === nodeId && e.predicate === 'object_of') {
      tripleIds.push(e.source)
    }
  }

  // Step 2: for each triple, find its subject atom via subject_of
  // edge pattern: triple --subject_of--> parent_atom
  for (const tripleId of tripleIds) {
    const tripleNode = nodeMap.get(tripleId)
    const predicateLabel = tripleNode?.label ?? 'related to'

    for (const e of edges) {
      if (e.source === tripleId && e.predicate === 'subject_of') {
        const parent = nodeMap.get(e.target)
        if (parent && parent.type !== 'graph_root') {
          results.push({ entity: parent, predicate: predicateLabel })
        }
      }
    }
  }

  return results
}

function getConnectedNodes(
  nodeId: string,
  edges: GraphEdge[],
  nodes: GraphNode[],
): { node: GraphNode; predicate: string; direction: 'in' | 'out' }[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const result: { node: GraphNode; predicate: string; direction: 'in' | 'out' }[] = []

  for (const edge of edges) {
    if (edge.source === nodeId) {
      const target = nodeMap.get(edge.target)
      if (target) result.push({ node: target, predicate: edge.label, direction: 'out' })
    } else if (edge.target === nodeId) {
      const source = nodeMap.get(edge.source)
      if (source) result.push({ node: source, predicate: edge.label, direction: 'in' })
    }
  }

  return result
}
