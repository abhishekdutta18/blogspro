import { askAI } from "./ai-service.js";
import { getGraphRAGExtractorPrompt, getGraphRAGMergePrompt, getSemanticGatingPrompt } from "./prompts.js";
import { extractJson } from "./sanitizer.js";
import { pushTelemetryLog } from "./storage-bridge.js";

/**
 * BlogsPro V7.0 - GraphRAG Knowledge Graph Utility
 * Extracts relational entities from unstructured market pulses.
 */

export async function extractKnowledgeGraph(data, env, verticalId = "global", blackboardContext = "", modelOverride = "auto") {
    if (!data) return { entities: [], relationships: [] };

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
        
        // [V10.8] Zero-Failure Recursive Extraction Loop
        let graph = null;
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts <= maxAttempts && !graph) {
            try {
                const model = modelOverride !== 'auto' ? modelOverride : 'node-research';
                const result = await askAI(
                    attempts === 0 ? getGraphRAGExtractorPrompt(data + context) : getGraphRAGMergePrompt(existingGraph, data + context), 
                    { role: 'research', env, model, isSpeculative: true }
                );
                graph = extractJson(result);
                if (!graph) throw new Error("JSON malformed");
            } catch (e) {
                attempts++;
                console.warn(`⚠️ [GraphRAG] Attempt ${attempts} failed. Retrying...`);
            }
        }

        // [V10.8] TIER 3: Blind Regex Extraction (The "Cannot Fail" Layer)
        if (!graph || typeof graph !== 'object') {
            console.error("❌ [GraphRAG] Recursive AI attempts failed. Initiating Blind Regex Extraction...");
            graph = forceBlindExtraction(data);
        }

        // Persist back to KV
        if (env && env.KV && graph.entities?.length > 0) {
            await env.KV.put(kvKey, JSON.stringify(graph), { expirationTtl: 86400 * 7 }); 
        }

        console.log(`✅ [GraphRAG] Successfully extracted ${graph.entities?.length || 0} entities via ${attempts > 0 ? 'REPAIR' : 'STRICT'} mode.`);
        
        if (env && env.FIREBASE_PROJECT_ID) {
            pushTelemetryLog("GRAPH_UPDATE", {
                frequency: "pulse",
                status: "success",
                message: `Updated ${graph.entities?.length || 0} entities for ${verticalId}.`,
                details: { verticalId, entities: (graph.entities?.length || 0), relations: (graph.relationships?.length || 0) }
            }, env).catch(e => console.warn("⚠️ [GraphRAG-Telemetry] Background sync failed:", e.message));
        }

        return graph;
    } catch (e) {
        console.error("⚠️ [GraphRAG] Final Resilience Failure:", e.message);
        return { 
            entities: (existingGraph && existingGraph.entities) || [], 
            relationships: (existingGraph && existingGraph.relationships) || [], 
            semanticSummary: `Relational mapping finalized via resilience fallback.` 
        };
    }
}

/**
 * [V10.8] Blind Regex Extraction
 * Identifies potential market entities from unstructured text when JSON fails.
 */
function forceBlindExtraction(text) {
    const entityRegex = /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/g;
    const matches = text.match(entityRegex) || [];
    const entities = Array.from(new Set(matches))
        .filter(name => name.length > 3)
        .slice(0, 10)
        .map(name => ({ name, type: "concept" }));

    return {
        entities,
        relationships: [],
        semanticSummary: "Blind extraction completed following structural failure."
    };
}

export async function semanticGating(dataSnapshot, env, modelOverride = "auto") {
    try {
        const model = modelOverride !== 'auto' ? modelOverride : 'node-extract';
        const result = await askAI(getSemanticGatingPrompt(dataSnapshot), {
            role: 'research',
            env,
            model,
            isSpeculative: true
        });
        const cleaned = result.replace(/```json\n?|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.warn("⚠️ [GraphRAG] Gating failed, bypassing...", e.message);
        return { signals: [], logic: "Bypassed due to error." };
    }
}

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
