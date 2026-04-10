/**
 * 🛰️ [V10.0] BlogsPro Remote Context Bridge
 * Fetches dynamic Swarm configurations (Verticals, Personas, Banned Words) 
 * from external sources like Google Drive or GitHub Gists.
 */

export async function hydrateRemoteContext(env = {}) {
    const remoteUrl = (env && env.REMOTE_CONFIG_URL) || (typeof process !== 'undefined' && process.env.REMOTE_CONFIG_URL) || null;
    if (!remoteUrl) {
        console.log("ℹ️ [RemoteConfig] No REMOTE_CONFIG_URL found. Using local hierarchy.");
        return null;
    }

    try {
        console.log(`📡 [RemoteConfig] Fetching context from: ${remoteUrl.substring(0, 30)}...`);
        const res = await fetch(remoteUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        
        const config = await res.json();
        const vCount = (config.VERTICALS || []).length;
        console.log(`✅ [RemoteConfig] Swarm metadata hydrated. [Verticals: ${vCount}] [Keys: ${Object.keys(config).join(', ')}]`);
        return config;
    } catch (e) {
        console.warn(`⚠️ [RemoteConfig] Failover to local: ${e.message}`);
        return null;
    }
}

/**
 * Utility to generate a Direct Link for Google Drive
 * (Assuming the user shares the file as "Anyone with link" -> "Viewer")
 */
export function getDriveDirectLink(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
