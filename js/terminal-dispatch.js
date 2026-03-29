import { showToast } from './config.js';

let dispatchTimerInterval = null;
let dispatchStartTime = null;

function padZero(num) {
  return String(num).padStart(2, '0');
}

export async function triggerTerminalDispatch() {
  const patInput = document.getElementById('ghPatInput');
  const pat = patInput ? patInput.value.trim() : '';

  if (!pat) {
    showToast('Please enter your GitHub Personal Access Token (PAT).', 'error');
    if (patInput) patInput.focus();
    return;
  }

  // Save PAT locally so they don't have to enter it again
  localStorage.setItem('blogspro_gh_pat', pat);

  const btn = document.getElementById('btnTerminalDispatch');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⚡ Dispatching...';
  }

  try {
    // 1. Trigger the workflow_dispatch event
    const response = await fetch('https://api.github.com/repos/abhishekdutta18/blogspro/actions/workflows/manual-dispatch.yml/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `token ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          frequency: 'weekly',
          force: 'true'
        }
      })
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
         throw new Error('Invalid GitHub Token or unauthorized. Make sure the PAT has "repo" or "actions" scope.');
      }
      throw new Error(`Failed to dispatch: ${response.statusText}`);
    }

    showToast('Weekly dispatch triggered successfully on GitHub!', 'success');
    
    // Start the timer UI tracking
    startDispatchTimer();

    // Begin polling GH api to wait for completion
    pollDispatchStatus(pat);
    
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '⚡ Trigger Weekly Pipeline';
    }
  }
}

function startDispatchTimer() {
  const container = document.getElementById('dispatchTimerContainer');
  const elapsedEl = document.getElementById('dispatchElapsed');
  const fillEl = document.getElementById('dispatchFill');
  const statusEl = document.getElementById('dispatchStatusText');

  if (container) container.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Pipeline is actively building tables/charts...';
  
  dispatchStartTime = Date.now();
  
  if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);

  dispatchTimerInterval = setInterval(() => {
    const elapsedMs = Date.now() - dispatchStartTime;
    const elapsedSecs = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(elapsedSecs / 60);
    const secs = elapsedSecs % 60;
    
    if (elapsedEl) {
      elapsedEl.textContent = `${padZero(mins)}:${padZero(secs)}`;
    }
    
    // 15 mins = 900 seconds
    const progress = Math.min((elapsedSecs / 900) * 100, 99);
    if (fillEl) {
      fillEl.style.width = `${progress}%`;
    }
  }, 1000);
}

async function pollDispatchStatus(pat) {
  // Wait 10 seconds before polling to let GitHub register the run
  setTimeout(async () => {
    let isCompleted = false;
    let runId = null;
    
    while (!isCompleted) {
      try {
        const response = await fetch('https://api.github.com/repos/abhishekdutta18/blogspro/actions/runs?event=workflow_dispatch&status=in_progress', {
           headers: {
             'Authorization': `token ${pat}`,
             'Accept': 'application/vnd.github.v3+json'
           }
        });
        
        if (response.ok) {
           const data = await response.json();
           const runs = data.workflow_runs || [];
           
           if (!runId && runs.length > 0) {
              runId = runs[0].id;
              const linkEl = document.getElementById('dispatchRunLink');
              if (linkEl) {
                 linkEl.href = runs[0].html_url;
                 linkEl.style.display = 'inline-block';
              }
           }
           
           // If we identified the run ID, check if it's still in the response
           if (runId) {
             const stillRunning = runs.some(r => r.id === runId);
             if (!stillRunning) {
               // Verify its final conclusion
               const finalResp = await fetch(`https://api.github.com/repos/abhishekdutta18/blogspro/actions/runs/${runId}`, {
                 headers: {
                   'Authorization': `token ${pat}`,
                   'Accept': 'application/vnd.github.v3+json'
                 }
               });
               if (finalResp.ok) {
                 const finalData = await finalResp.json();
                 isCompleted = true;
                 stopDispatchTimer(finalData.conclusion === 'success');
                 break;
               }
             }
           }
        }
      } catch (e) {
         console.warn("Poll error", e);
      }
      
      // Poll every 15 seconds
      await new Promise(r => setTimeout(r, 15000));
    }
  }, 10000);
}

function stopDispatchTimer(success) {
  if (dispatchTimerInterval) clearInterval(dispatchTimerInterval);
  
  const fillEl = document.getElementById('dispatchFill');
  const statusEl = document.getElementById('dispatchStatusText');
  const btn = document.getElementById('btnTerminalDispatch');

  if (fillEl) {
    fillEl.style.width = '100%';
    fillEl.style.background = success ? 'var(--green)' : '#fca5a5';
  }
  
  if (statusEl) {
    statusEl.innerHTML = success ? '✅ Successfully completed and deployed!' : '❌ Pipeline failed! Please check logs.';
    statusEl.style.color = success ? 'var(--green)' : '#fca5a5';
  }
  
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '⚡ Trigger Weekly Pipeline';
  }
  
  if (success) showToast('Masterpiece Generation Completed!', 'success');
}

// Attach to window
window.triggerTerminalDispatch = triggerTerminalDispatch;

document.addEventListener('DOMContentLoaded', () => {
  const savedPat = localStorage.getItem('blogspro_gh_pat');
  const patInput = document.getElementById('ghPatInput');
  if (savedPat && patInput) {
    patInput.value = savedPat;
  }
});
