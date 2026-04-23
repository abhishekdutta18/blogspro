/**
 * BlogsPro Intelligence Engine (V21.0)
 * -----------------------------------
 * Implements advanced reasoning models:
 * 1. Decision Tree (Model Routing)
 * 2. Markov Chain (Agent Transitions)
 */

/**
 * Decision Tree Routing Logic
 * Maps task types to the optimal LLM in the current resource pool.
 */
export function routeToBestModel(taskType, env = {}) {
    const pool = (env.AI_POOL_PREFERENCE || 'hybrid').toLowerCase();
    const isCloud = pool === 'cloud' || pool === 'hybrid';

    // [V21.0] Hardened model topology — only models present in the active pool.
    // Removed phantom meta-llama-4 references (no active API key supports them locally).
    const tree = {
        'research': {
            'priority': "gemini-3.1-pro-preview",       // High-capability, quota-heavy
            'standard': "gemini-3.1-flash-lite-preview", // Default: fast + higher RPD quota
            'deep': "llama-3.3-70b-versatile"            // Groq Llama for when Gemini quota is out
        },
        'draft': {
            'high_density': "gemini-3.1-pro-preview",
            'standard': "gemini-3.1-flash-lite-preview",
            'local': "gemini-3.1-flash-lite-preview"
        },
        'audit': {
            'strict': "gemini-3.1-pro-preview",
            'standard': "gemini-3.1-flash-lite-preview"
        },
        'fidelity': {
            'repair': "gemini-3.1-flash-lite-preview",
            'cleanup': "gemini-3.1-flash-lite-preview"
        }
    };

    let selectedModel = "gemini-3.1-flash-lite-preview"; // Safe default

    switch(taskType) {
        case 'research':
            if (env.STRICT_MODE && isCloud) selectedModel = tree.research.deep;
            else selectedModel = env.EXTENDED_MODE ? tree.research.priority : tree.research.standard;
            break;

        case 'draft':
            if (env.MODE === 'institutional') selectedModel = tree.draft.high_density;
            else selectedModel = env.EXTENDED_MODE ? tree.draft.standard : tree.draft.local;
            break;

        case 'audit':
            selectedModel = env.STRICT_MODE ? tree.audit.strict : tree.audit.standard;
            break;

        case 'fidelity':
            selectedModel = tree.fidelity.repair;
            break;

        default:
            selectedModel = "gemini-3.1-flash-lite-preview";
    }

    // [V21.0] If Gemini globally disabled, fall back to Groq (not phantom meta-llama-4)
    if (env.GEMINI_ENABLED === false && selectedModel.includes('gemini')) {
        console.log(`🛡️ [Intelligence-Engine] Gemini disabled. Remapping ${selectedModel} -> llama-3.3-70b-versatile`);
        return "llama-3.3-70b-versatile";
    }

    return selectedModel;
}

/**
 * Markov State Machine
 * Determines the next agent state based on the current output's fidelity score.
 */
export function getNextSwarmState(currentState, metrics = {}) {
    const { fidelityScore = 0, iterations = 0, type = 'weekly' } = metrics;
    
    // States: RESEARCH -> DRAFT -> AUDIT -> [REPAIR | FINALIZE]
    
    const matrix = {
        'INIT': () => 'RESEARCH',
        'RESEARCH': () => 'THINK',
        'THINK': () => 'DRAFT',
        'DRAFT': () => 'AUDIT',
        'AUDIT': () => {
            if (fidelityScore >= 80) return 'FINALIZE';
            if (iterations >= 3) return 'FORCE_FINALIZE'; // Prevent infinite loops
            return 'REPAIR';
        },
        'REPAIR': () => 'AUDIT'
    };

    const next = matrix[currentState] ? matrix[currentState]() : 'FINALIZE';
    
    console.log(`🧬 [Markov] Transition: ${currentState} -> ${next} (Fidelity: ${fidelityScore}%, Iter: ${iterations})`);
    return next;
}
