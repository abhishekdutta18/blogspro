import { initFirebase } from './firebase-service.js';
import { hydrateSwarmPrompts } from './prompts.js';
import * as localPrompts from './prompts.js';
import { genkit } from 'genkit';
import path from 'path';

class PromptManager {
    constructor() {
        this.templates = new Map();
        this.isInitialized = false;
        this.collectionName = 'prompt_templates';
        
        // [V16.3] Genkit Integration
        this.ai = genkit({
            plugins: [], // Base instance for prompt loading
            promptDir: path.join(process.cwd(), 'prompts')
        });
    }

    /**
     * [V1.0] Cloud Sync
     * Pulls all managed prompt templates from Firebase AI Logic (Firestore store).
     */
    async sync() {
        console.log("📡 [PromptManager] Synchronizing with Firebase AI Logic...");
        const { db } = initFirebase();
        if (!db) {
            console.warn("⚠️ [PromptManager] Firebase not initialized. Using local fallbacks.");
            return false;
        }

        try {
            // 1. Fetch Logic Templates
            const snapshot = await db.collection(this.collectionName).get();
            snapshot.forEach(doc => {
                const data = doc.data();
                this.templates.set(doc.id, data.template);
            });

            // 2. Fetch Institutional Vertical Scaling
            const configRef = db.collection('institutional_config').doc('verticals');
            const configDoc = await configRef.get();
            if (configDoc.exists) {
                const data = configDoc.data();
                if (data.list) {
                    hydrateSwarmPrompts({ VERTICALS: data.list });
                    console.log(`📡 [PromptManager] Hydrated ${data.list.length} research verticals from cloud.`);
                }
            }

            this.isInitialized = true;
            console.log(`✅ [PromptManager] Synchronized ${this.templates.size} cloud logic templates.`);
            return true;
        } catch (error) {
            console.error(`❌ [PromptManager] Cloud sync failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Resolves a prompt template with variables.
     * [V16.5] HARDENED HANDSHAKE:
     * 1. Check Cloud-synced cache (Firebase AI Logic Priority)
     * 2. Check local Genkit .prompt files
     * 3. Fallback to legacy function-based prompts
     */
    async resolve(templateId, variables = {}, localFallbackName = null, fallbackArgs = []) {
        let template = this.templates.get(templateId);

        // [Handshake] Always ensure persona is present
        variables.persona = localPrompts.INSTITUTIONAL_PERSONA;
        variables.structuralRules = localPrompts.STRUCTURAL_RULES;

        // 1. [Cloud Priority]
        if (template) {
            console.log(`📡 [PromptManager] Resolved '${templateId}' from Firebase Server Template (ACTIVE).`);
            return this._interpolate(template, variables);
        }

        // 2. [Genkit Native]
        try {
            const dotPrompt = await this.ai.prompt(templateId);
            if (dotPrompt) {
                console.log(`🚀 [PromptManager] Resolved '${templateId}' from Local Dotprompt.`);
                const res = await dotPrompt.render({ ...variables });
                return res.text;
            }
        } catch (e) {
            // Silently fall back
        }

        // 3. [Local Fallback]
        if (localFallbackName && typeof localPrompts[localFallbackName] === 'function') {
            console.log(`🏠 [PromptManager] Using legacy fallback for '${templateId}'.`);
            return localPrompts[localFallbackName](...fallbackArgs);
        }

        // 4. Constant Fallback
        if (localPrompts[templateId.toUpperCase()]) {
             return localPrompts[templateId.toUpperCase()];
        }

        throw new Error(`[PromptManager] Critical Failure: Template '${templateId}' not found in Cloud or Local.`);
    }

    /**
     * Simple Mustache-style interpolation: {{variable}}
     */
    _interpolate(template, variables) {
        let result = template;
        
        // Always inject dynamic date if requested
        if (!variables.currentDate) {
            variables.currentDate = new Date().toLocaleDateString('en-US', { 
                year: 'numeric', month: 'long', day: 'numeric' 
            });
        }

        // Hydrate all available variables
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, value || "");
        }
        
        // Clean up any double-braced remainders
        result = result.replace(/{{.*?}}/g, "");

        return result;
    }
}

export const promptManager = new PromptManager();
