import { applyHumanRefinement } from './lib/swarm-orchestrator.js';
import { syncToFirestore } from './lib/storage-bridge.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const env = process.env;

async function simulateHILAudit() {
    console.log("🚀 [HIL-SIM] Starting Institutional HIL Workflow Simulation...");
    
    const jobId = "hil-sim-" + Date.now().toString().slice(-6);
    
    // 1. Initial Draft Phase
    console.log(`📡 [Stage 1] Pushing Initial Manuscript [Job: ${jobId}]...`);
    const initialContent = `
        <h1 style="color:#A855F7">Strategic Research Manuscript: Emerging Markets Alpha</h1>
        <p>This institutional briefing covers the upcoming rotation into Nifty Midcap indices.</p>
        <h2>Executive Summary</h2>
        <blockquote>The primary thesis involves a 12% consolidation baseline.</blockquote>
        <p>Institutional steering is requested for the APAC exposure weighting.</p>
    `;

    const initialAuditData = {
        jobId: jobId,
        frequency: "weekly",
        content: initialContent,
        pdfUrl: `https://storage.blogspro.in/manuscripts/${jobId}.pdf`,
        status: "PENDING",
        wordCount: 150,
        type: "briefing",
        lastRefined: ""
    };

    try {
        await syncToFirestore("institutional_audits", initialAuditData, env, jobId);
        console.log(`✅ [Success] Initial Draft synced to Firestore.`);

        // 2. Simulated Refinement Phase (Triggered by user feedback in Admin UI)
        console.log(`📡 [Stage 2] Simulating Human Refinement Injection...`);
        const feedback = "Increase emphasis on the GIFT City arbitrage Corridor and add a warning about liquidity risk.";
        
        // This will call askAI, generate a new PDF, and sync back to Firestore
        const refinedContent = await applyHumanRefinement(initialContent, feedback, initialAuditData.frequency, env, jobId);
        
        console.log(`✅ [Success] HIL Refinement Loop completed for Job: ${jobId}`);
        console.log(`📄 Refined content length: ${refinedContent.length} bytes.`);
        console.log(`👉 Check your Admin Dashboard: The status should be PENDING and a new PDF should be linked.`);
        
    } catch (e) {
        console.error("❌ Error in simulation:", e.message);
    }
}

simulateHILAudit();
