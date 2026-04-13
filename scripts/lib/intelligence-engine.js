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
    const pool = env.AI_POOL_PREFERENCE || 'hybrid';
    
    const tree = {
        'research': {
            'high_fidelity': "DeepSeek-V3", // 671B MoE (1T class)
            'consensus': "nvidia/nemotron-4-340b-instruct", // High-density reasoning
            'standard': "moonshotai/kimi-k1.5-pro",
            'executive': "x-ai/grok-1"
        },
        'draft': {
            'high_density': "gemini-3.1-pro-preview",
            'standard': "gemma4" // Local Enhanced formatting
        },
        'audit': {
            'strict': "gemma4", // user-specified Specialist structurer
            'light': "meta-llama-4-8b-instruct"
        },
        'fidelity': {
            'repair': "gemma4", // Local Self-healing pass
            'cleanup': "meta-llama-4-8b-instruct"
        }
    };

    // Routing Logic
    switch(taskType) {
        case 'research':
            return (env.STRICT_MODE) ? tree.research.high_fidelity : tree.research.standard;
        case 'draft':
            return (env.EXTENDED_MODE) ? tree.draft.high_density : tree.draft.standard;
        case 'audit':
            return tree.audit.strict;
        case 'fidelity':
            return tree.fidelity.repair;
        default:
            return "meta-llama-4-8b-instruct";
    }
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
