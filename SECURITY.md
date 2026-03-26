# BlogsPro Security — Firebase Data Protection

This document explains how consumer-side (client) Firebase keys are handled and how we protect the data in this project.

## 1. Firebase API Key "Exposure"
In Firebase, the **Web Configuration** (API Key, Project ID, etc.) is meant to be public. It is included in the client-side code so the browser can communicate with Firebase services. These keys are **not** like server-side administrative keys; they do not grant full access to your database.

## 2. Real Security: Firebase Security Rules 🛡️
Security in BlogsPro is enforced at the **database level**, not by keeping the API key secret. 

- **Firestore Rules**: We have implemented rules that restrict write access to the `posts` collection only to users with the `admin` or `coauthor` role.
- **Authentication**: Users must be authenticated to perform actions like commenting or updating their profile.

## 3. Hardening: Domain Restriction
For added protection, you should restrict your Firebase API Key in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
1. Find your API Key (usually `Browser key (auto-created by Firebase)`).
2. Set **Application Restrictions** to **Websites**.
3. Add your domain: `blogspro.in/*` and `localhost:*` (for testing).

This prevents other websites from using your API key to interact with your Firebase project even if they have the key.

## 4. Centralization
We have consolidated the Firebase configuration into `js/firebase-config.js` to ensure consistency and make it easier to rotate keys if ever needed.
