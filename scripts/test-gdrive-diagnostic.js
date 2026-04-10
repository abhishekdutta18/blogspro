import { getGoogleAccessToken } from './lib/storage-bridge.js';
import dotenv from 'dotenv';
dotenv.config();

async function testGDrive() {
    const env = process.env;
    const folderId = env.GDRIVE_BUCKET_ID;
    
    console.log(`🔍 Testing GDrive Access for folder: ${folderId}`);
    
    try {
        const token = await getGoogleAccessToken(env);
        if (!token) throw new Error("Could not get OAuth token");
        
        const driveParams = "supportsAllDrives=true&includeItemsFromAllDrives=true";

        // 1. List files in the folder to verify 'Read' access
        const listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name)&${driveParams}`;
        const listRes = await fetch(listUrl, { headers: { "Authorization": `Bearer ${token}` } });
        const listData = await listRes.json();
        
        if (listData.error) {
            console.error("❌ GDrive List Error:", listData.error.message);
            return;
        }
        
        console.log(`✅ Connection Successful. Found ${listData.files?.length || 0} files in folder.`);
        
        // 2. Try to create a tiny dummy file to verify 'Write' access and Quota
        console.log("📝 Attempting tiny write test with supportsAllDrives=true...");
        const metadata = { name: "connection-test.txt", parents: [folderId] };
        const boundary = "-------314159265358979323846";
        const content = "BlogsPro Telemetry Connection Test " + new Date().toISOString();
        
        const delimiter = `\r\n--${boundary}\r\n`;
        const close_delim = `\r\n--${boundary}--`;
        const body = delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            `Content-Type: text/plain\r\n\r\n` +
            content +
            close_delim;

        const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": `multipart/related; boundary=${boundary}`
            },
            body
        });
        
        const uploadData = await uploadRes.json();
        if (uploadRes.ok) {
            console.log("✅ Write Successful! File ID:", uploadData.id);
        } else {
            console.error("❌ Write Failed:", uploadData.error?.message || JSON.stringify(uploadData));
        }

    } catch (e) {
        console.error("❌ Diagnostic Failure:", e.message);
    }
}

testGDrive();
