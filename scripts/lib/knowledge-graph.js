import { askAI } from "./ai-service.js";
import { getGraphRAGExtractorPrompt, getGraphRAGMergePrompt } from "./prompts.js";
import { pushTelemetryLog } from "./storage-bridge.js";

/**
 * BlogsPro V7.0 - GraphRAG Knowledge Graph Utility
 * Extracts relational entities from unstructured market pulses.
 */

export async function extractKnowledgeGraph(data, env, verticalId = "global", blackboardContext = "") {
    if (!data) return { entities: [], relationships: [] };

    // BlogsPro V7.1: Single Unified Institutional Brain (User Override)
    const kvKey = `graph-v7-unified-brain`;
    let existingGraph = { entities: [], relationships: [] };
    
    if (env && env.KV) {
        try {
            existingGraph = await env.KV.get(kvKey, { type: 'json' }) || existingGraph;
        } catch (e) { console.error("⚠️ [GraphRAG] KV Read Fail:", e.message); }
    }

    try {
        console.log(`🕸️ [GraphRAG] Analyzing ${verticalId} semantic relationships...`);
        
        const context = blackboardContext ? `\n--- Blackboard Context ---\n${blackboardContext}\n` : "";
        let graph;
        
        if (existingGraph.entities.length > 0) {
            // "Both" Strategy: Merge Fresh Pulse + Blackboard with Persistent KV
            const mergedStr = await askAI(getGraphRAGMergePrompt(existingGraph, data + context), { 
                role: 'research', env, model: 'node-research' 
            });
            const cleaned = mergedStr.replace(/```json\n?|```/g, '').trim();
            graph = JSON.parse(cleaned);
        } else {
            // Fresh start with Institutional Extraction
            const result = await askAI(getGraphRAGExtractorPrompt(data + context), { 
                role: 'research', env, model: 'node-research' 
            });
            const cleaned = result.replace(/```json\n?|```/g, '').trim();
            graph = JSON.parse(cleaned);
        }

        // Persist back to KV
        if (env && env.KV && graph.entities?.length > 0) {
            await env.KV.put(kvKey, JSON.stringify(graph), { expirationTtl: 86400 * 7 }); // 1 week retention
        }

        console.log(`✅ [GraphRAG] Updated ${graph.entities?.length || 0} entities for ${verticalId}.`);
        
        // 🚀 Institutional Telemetry
        ctx.waitUntil(pushTelemetryLog("GRAPH_UPDATE", {
            frequency: "pulse",
            status: "success",
            message: `Updated ${graph.entities?.length || 0} entities for ${verticalId}.`,
            details: { verticalId, entities: graph.entities?.length, relations: graph.relationships?.length }
        }, env));

        return graph;
    } catch (e) {
        console.error("⚠️ [GraphRAG] Extraction failed:", e.message);
        return existingGraph.entities.length > 0 ? existingGraph : { entities: [], relationships: [], semanticSummary: "Relational mapping failed." };
    }
}

/**
 * [V7.0] Semantic Gating
 * Prunes transient market noise from the persistent institutional map.
 */
export async function semanticGating(dataSnapshot, env) {
    try {
        const result = await askAI(getSemanticGatingPrompt(dataSnapshot), {
            role: 'research',
            env,
            model: 'node-extract' // High-speed gating
        });
        const cleaned = result.replace(/```json\n?|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.warn("⚠️ [GraphRAG] Gating failed, bypassing...", e.message);
        return { signals: [], logic: "Bypassed due to error." };
    }
}

/**
 * Generates a formatted string for injection into researcher prompts.
 */
export function formatGraphContext(graph) {
    if (!graph || !graph.entities) return "";

    const entities = graph.entities.map(e => `[${e.name} (${e.type})]`).join(', ');
    const relations = graph.relationships.map(r => `${r.source} -> ${r.target} (${r.relation})`).join('\n');
    
    return `
ENTITY_NETWORK: ${entities}
RELATIONSHIP_TREE:
${relations}

SCHEMA_SUMMARY: ${graph.semanticSummary || "No summary available."}
`;
}
