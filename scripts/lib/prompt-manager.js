import { getDocument, listDocuments, isStoreConfigured } from './vps-store.js';
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
     * Pulls server-managed prompt templates (prompt_templates) and the research
     * vertical list (institutional_config/verticals) from the BlogsPro API.
     * Without the API the local Dotprompt and prompts.js fallbacks are used.
     */
    async sync(env) {
        if (!isStoreConfigured(env)) {
            console.warn("⚠️ [PromptManager] Document store not configured. Using local fallbacks.");
            return false;
        }
        const templates = await listDocuments(this.collectionName, {}, env);
        for (const doc of templates) {
            if (doc.template) this.templates.set(doc.id, doc.template);
        }
        const verticals = await getDocument('institutional_config', 'verticals', env);
        if (Array.isArray(verticals?.list)) {
            hydrateSwarmPrompts({ VERTICALS: verticals.list });
            console.log(`📡 [PromptManager] Hydrated ${verticals.list.length} research verticals from the API.`);
        }
        this.isInitialized = true;
        console.log(`✅ [PromptManager] Synchronized ${this.templates.size} server templates.`);
        return true;
    }

    /**
     * Resolves a prompt template with variables.
     * [V16.5] HARDENED HANDSHAKE:
     * 1. Check server-synced templates
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
            console.log(`📡 [PromptManager] Resolved '${templateId}' from a server template.`);
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
