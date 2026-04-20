/**
 * BlogsPro Intelligence Engine (V12.0)
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
    
    // V16.5: Adaptive Role-to-Model Topology
    const tree = {
        'research': {
            'priority': isCloud ? "gemini-3.1-pro-preview" : "meta-llama-4-70b-instruct",
            'standard': isCloud ? "meta-llama-4-70b-instruct" : "meta-llama-4-8b-instruct",
            'deep': "DeepSeek-V3" // Specialist for heavy research
        },
        'draft': {
            'high_density': "gemini-3.1-pro-preview",
            'standard': "meta-llama-4-70b-instruct",
            'local': "gemma4"
        },
        'audit': {
            'strict': isCloud ? "gemini-3.1-pro-preview" : "gemma4",
            'standard': "meta-llama-4-8b-instruct"
        },
        'fidelity': {
            'repair': "meta-llama-4-70b-instruct",
            'cleanup': "meta-llama-4-8b-instruct"
        }
    };

    // [V17.0] Strategic Override: Check if Gemini is disabled globally
    let selectedModel = "meta-llama-4-8b-instruct";
    
    // Routing Logic: Optimized for Institutional Balance
    switch(taskType) {
        case 'research':
            // In STRICT_MODE, we prioritize Deep Reasoners
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
            selectedModel = "meta-llama-4-8b-instruct";
    }

    // --- GEMINI_PROTECTION_SHIELD ---
    if (env.GEMINI_ENABLED === false && selectedModel.includes('gemini')) {
        console.log(`🛡️ [Intelligence-Engine] Gemini disabled. Remapping ${selectedModel} -> meta-llama-4-70b-instruct`);
        return "meta-llama-4-70b-instruct";
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
        'RESEARCH': () => 'DRAFT',
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
