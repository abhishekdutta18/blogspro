import { initFirebase } from './lib/firebase-service.js';
import * as localPrompts from './lib/prompts.js';
import admin from 'firebase-admin';

/**
 * BlogsPro Prompt Migration Utility (V1.0)
 * ---------------------------------------
 * This script exports local JS prompt templates to Firebase AI Logic (Firestore).
 */
async function runMigration() {
    console.log("🚀 [Migration] Initiating BlogsPro Prompt Migration to Firebase AI Logic...");
    const { db } = initFirebase();
    if (!db) {
        console.error("❌ [Migration] Firestore initialization failed. Check credentials.");
        process.exit(1);
    }

    const collectionName = 'prompt_templates';
    
    // Define the Prompts to migrate
    // We convert JS function logic into standardized "Mustache" templates
    const templates = [
        {
            id: 'institutional_persona',
            template: localPrompts.INSTITUTIONAL_PERSONA.replace(/\${new Date\(\)\.toLocaleDateString\([^)]*\)}/g, "{{currentDate}}")
        },
        {
            id: 'structural_rules',
            template: localPrompts.STRUCTURAL_RULES
        },
        {
            id: 'chart_sync_rule',
            template: localPrompts.CHART_SYNC_RULE
        },
        {
            id: 'drafter',
            template: localPrompts.getDrafterPrompt("{{frequency}}", "{{researchBrief}}", "{{verticalName}}", "{{rlMemory}}")
                .replace(localPrompts.INSTITUTIONAL_PERSONA, "{{INSTITUTIONAL_PERSONA}}")
                .replace(localPrompts.STRUCTURAL_RULES, "{{STRUCTURAL_RULES}}")
        },
        {
            id: 'researcher',
            template: localPrompts.getResearcherPrompt("{{frequency}}", "{{dataSnapshot}}", "{{historicalData}}", "{{internetResearch}}", "{{rlMemory}}", "{{semanticMap}}", "{{blackboardContext}}")
                .replace(localPrompts.INSTITUTIONAL_PERSONA, "{{INSTITUTIONAL_PERSONA}}")
        },
        {
            id: 'critic',
            template: localPrompts.getCriticPrompt("{{researchBrief}}", "{{draft}}")
                .replace(localPrompts.INSTITUTIONAL_PERSONA, "{{INSTITUTIONAL_PERSONA}}")
        },
        {
            id: 'editor',
            template: localPrompts.getEditorPrompt("{{rawDraft}}", "{{frequency}}")
                .replace(localPrompts.INSTITUTIONAL_PERSONA, "{{INSTITUTIONAL_PERSONA}}")
        },
        {
            id: 'manager_audit',
            template: localPrompts.getManagerAuditPrompt("{{manuscript}}", "{{verticalName}}", { MANAGER_COMMAND: "{{managerCommand}}" })
                .replace(localPrompts.INSTITUTIONAL_PERSONA, "{{INSTITUTIONAL_PERSONA}}")
        }
    ];

    console.log(`📦 [Migration] Prepared ${templates.length} templates for upload.`);

    for (const item of templates) {
        try {
            console.log(`💾 [Migration] Uploading template: ${item.id}...`);
            await db.collection(collectionName).doc(item.id).set({
                template: item.template,
                type: 'institutional_swarm',
                version: '1.0.0',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ [Migration] Successfully migrated: ${item.id}`);
        } catch (e) {
            console.error(`❌ [Migration] Failed to migrate ${item.id}: ${e.message}`);
        }
    }

    console.log("\n✨ [Migration] Prompt Migration Complete. The Firebase AI Logic console is now populated.");
    process.exit(0);
}

runMigration();
