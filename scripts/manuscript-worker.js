/**
 * BlogsPro Manuscript Aggregator (Durable Object)
 * ===============================================
 * Responsible for:
 * 1. Stateful accumulation of 16 research verticals.
 * 2. Progress orchestration (0-100%).
 * 3. Real-time collaboration hook (Yjs placeholder).
 * 4. Zero-timeout recursive generation management.
 */

export class ManuscriptAggregator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // Initialized state
    this.state.blockConcurrencyWhile(async () => {
      let stored = await this.state.storage.get("data");
      this.data = stored || {
        id: null,
        frequency: null,
        verticals: {}, // { id: { status: 'pending', content: '' } }
        fullContent: "",
        percentComplete: 0,
        startTime: Date.now()
      };
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method;

    if (url.pathname === "/initialize") {
      const { jobId, frequency, verticalIds } = await request.json();
      this.data.id = jobId;
      this.data.frequency = frequency;
      verticalIds.forEach(vid => {
        this.data.verticals[vid] = { status: 'pending', content: '' };
      });
      await this.state.storage.put("data", this.data);
      return new Response(JSON.stringify({ status: "initialized" }));
    }

    if (url.pathname === "/update") {
      const { verticalId, content } = await request.json();
      if (this.data.verticals[verticalId]) {
        this.data.verticals[verticalId].status = 'completed';
        this.data.verticals[verticalId].content = content;
        
        // Update percentages
        const completed = Object.values(this.data.verticals).filter(v => v.status === 'completed').length;
        const total = Object.keys(this.data.verticals).length;
        this.data.percentComplete = Math.floor((completed / total) * 100);
        
        // Intersperse content
        this.data.fullContent += content; 
        
        await this.state.storage.put("data", this.data);
      }
      return new Response(JSON.stringify({ status: "updated", progress: this.data.percentComplete }));
    }

    if (url.pathname === "/status") {
      return new Response(JSON.stringify(this.data), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
}

// Durable Object Worker Entry Point
export default {
  async fetch(request, env) {
    // In a standard setup, this worker might just serve the DO.
    // We expect the Pulse worker to call this via a DO binding.
    return new Response("BlogsPro Manuscript DO Node Active.");
  }
};
