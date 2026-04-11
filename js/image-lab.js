import { api } from './services/api.js';

let currentUser = null;

// Check Auth via Proxy
async function initAuth() {
    try {
        const user = await api.auth.me();
        if (user) {
            currentUser = user;
            document.getElementById('auth-gate').style.display = 'none';
            document.getElementById('lab-content').style.display = 'block';
        } else {
            window.location.href = 'login.html';
        }
    } catch (err) {
        window.location.href = 'login.html';
    }
}
initAuth();

// UI Elements
const promptInput = document.getElementById('image-prompt');
const generateBtn = document.getElementById('generate-btn');
const resultContainer = document.getElementById('result-container');
const previewImg = document.getElementById('preview-img');
const placeholderBtn = document.getElementById('copy-placeholder-btn');
const statusMsg = document.getElementById('status-msg');

// Mock generation for now (to be replaced with actual AI API)
async function generateAIImage(prompt) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(`https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800&q=${encodeURIComponent(prompt)}`);
        }, 2000);
    });
}

window.handleGenerate = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        showStatus('Please enter a descriptive prompt.', 'error');
        return;
    }

    setLoading(true);
    try {
        const imageUrl = await generateAIImage(prompt);
        previewImg.src = imageUrl;
        previewImg.style.display = 'block';
        resultContainer.classList.add('has-result');
        
        // Log to Firestore history via Proxy
        if (currentUser) {
            await api.data.create('image_generation_history', {
                uid: currentUser.uid,
                prompt: prompt,
                url: imageUrl,
                createdAt: new Date().toISOString()
            });
        }

        showStatus('Image generated successfully!', 'success');
    } catch (err) {
        console.error('Generation failed:', err);
        showStatus('Generation failed. Please try again.', 'error');
    } finally {
        setLoading(false);
    }
};

window.copyPlaceholder = () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        showStatus('Enter a prompt first to create a placeholder.', 'error');
        return;
    }
    const placeholder = `[AI IMAGE: ${prompt}]`;
    navigator.clipboard.writeText(placeholder).then(() => {
        showStatus('Placeholder copied! Paste it in your post.', 'success');
    });
};

function setLoading(isOn) {
    if (!generateBtn) return;
    generateBtn.disabled = isOn;
    generateBtn.innerHTML = isOn ? '<span class="spinner"></span> Generating...' : 'Generate Magic';
    if (isOn) {
        resultContainer.classList.add('loading');
        previewImg.style.opacity = '0.3';
    } else {
        resultContainer.classList.remove('loading');
        previewImg.style.opacity = '1';
    }
}

function showStatus(msg, type) {
    if (!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${type}`;
    setTimeout(() => { statusMsg.textContent = ''; }, 4000);
}
