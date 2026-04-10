# 🛰️ Google Drive "Bucket" Setup Guide

To enable remote storage for your Swarm's "Sector Buckets" (Research fragments and metadata), follow these steps to configure your Google Drive folder and link it to the BlogsPro pipeline.

## 1. Create your Storage Folder
1.  Open [Google Drive](https://drive.google.com).
2.  Create a **New Folder** (e.g., `blogspro_swarm_buckets`).
3.  Open the folder.

## 2. Extract your Folder ID
Look at the URL in your browser's address bar. The Folder ID is the long string of characters after `folders/`.
- **Example URL**: `https://drive.google.com/drive/u/0/folders/1aBcD_2eFgHiJkLmNoPqRsTuVwXyZ1234`
- **Your Folder ID**: `1aBcD_2eFgHiJkLmNoPqRsTuVwXyZ1234`

## 3. Share with the Swarm Service Account
Your Swarm uses a Service Account to write files. You must grant it permission to access your folder:
1.  Click the folder name at the top -> **Share**.
2.  Add the following email address as an **Editor**:
    > `firebase-adminsdk-q0p9j@blogspro-ai.iam.gserviceaccount.com`
3.  Uncheck "Notify people" to avoid email errors and click **Send**.

## 4. Update your Configuration
Add the Folder ID to your `.env` file or your Cloudflare Worker environment variables:

```bash
# In your .env file
GDRIVE_BUCKET_ID="PASTE_YOUR_FOLDER_ID_HERE"
```

## 5. Execute Migration
Now that the folder is ready, run the migration script to move your metadata to the cloud:
```bash
export PATH=$PATH:/opt/homebrew/bin
node scripts/migrate-buckets-to-gdrive.js
```

> [!TIP]
> **Check your progress**: Once you run the migration, a file named `institutional-metadata.json` will appear in your Google Drive folder. This confirms the "Bucket" is active!
