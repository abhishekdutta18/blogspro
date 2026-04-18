import { genkitPlugin } from 'genkit/plugin';
import { z } from 'genkit';
import { askAI, ResourceManager } from './ai-service.js';

/**
 * BlogsPro Sovereign AI Bridge Plugin for Genkit
 */
export const blogsProSovereignAI = (env = {}) => genkitPlugin('blogspro', async (ai) => {
  console.log('🔌 [Genkit-Plugin] Initializing BlogsPro Sovereign Bridge...');

  const blogsProModelConfigSchema = z.object({
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    topP: z.number().optional(),
    role: z.string().optional(),
  });

  const defineBlogsProModel = (name, modelRole, defaultModel) => {
    ai.defineModel({
      name: name,
      supports: {
        multiturn: true,
        media: false,
        tools: true,
        systemRole: true,
      },
      configSchema: blogsProModelConfigSchema,
    }, async (request) => {
      // Lazy Init on first call
      await ResourceManager.init(env);

      const lastMessage = request.messages[request.messages.length - 1];
      const prompt = lastMessage.content[0].text;
      const role = request.config?.role || modelRole;
      const model = defaultModel;

      console.log(`📡 [Genkit-Bridge] Routing to BlogsPro Fleet: ${name} (Role: ${role})`);

      const responseText = await askAI(prompt, { role, model, env });

      return {
        message: {
          role: 'model',
          content: [{ text: responseText }],
        },
        finishReason: 'stop',
      };
    });
  };

  defineBlogsProModel('sambanova-405b', 'research', 'Meta-Llama-3.1-405B-Instruct-v2');
  defineBlogsProModel('cerebras-70b', 'draft', 'llama-3.3-70b');
  defineBlogsProModel('groq-70b', 'edit', 'llama-3.3-70b-versatile');
});
