# BlogsPro — Setup Guide

A full-featured blog platform built with Vanilla HTML/CSS/JS + Firebase (Firestore + Auth).

## File Structure

```
blogspro/
├── index.html          ← Public homepage (blog feed)
├── post.html           ← Single post reader
├── login.html          ← Admin login (Firebase Auth)
├── admin.html          ← Admin dashboard + post editor
├── js/
│   └── firebase-config.js   ← Shared config reference
└── README.md
```

---

## 1. Firebase Setup

### Create your Firebase project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable **Firestore Database** → Start in production mode
4. Enable **Authentication** → Email/Password provider

### Get your config
1. Firebase Console → Project Settings → Your Apps → Add Web App
2. Copy the `firebaseConfig` object

### Add config to all 4 HTML files
Search for `YOUR_API_KEY` in each file and replace the entire `firebaseConfig` block:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123...:web:abc..."
};
```

Files to update: `index.html`, `post.html`, `login.html`, `admin.html`

---

## 2. Create your admin account

In Firebase Console → Authentication → Users → Add User  
Enter your email and password. This will be your login for `admin.html`.

---

## 3. Firestore Collections

Collections are created automatically when you first publish a post.

**`posts` collection** (auto-created on first publish):
```
{
  title:      string,
  excerpt:    string,
  content:    HTML string,
  category:   "Fintech" | "Compliance" | "Strategy",
  slug:       string,
  published:  boolean,
  createdAt:  timestamp,
  updatedAt:  timestamp
}
```

**`subscribers` collection** (auto-created on first newsletter signup):
```
{
  email:     string,
  createdAt: timestamp
}
```

### Firestore Security Rules
In Firebase Console → Firestore → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Public can read published posts
    match /posts/{postId} {
      allow read: if resource.data.published == true;
      allow write: if request.auth != null;
    }

    // Public can write to subscribers (newsletter signup)
    match /subscribers/{subId} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }
  }
}
```

---

## 4. Deploy to GitHub Pages

1. Push all files to your GitHub repo
2. GitHub → Settings → Pages → Source: `main` branch, `/ (root)`
3. Your blog will be live at `https://yourusername.github.io/your-repo/`

---

## 5. Usage

| Page | URL | Purpose |
|------|-----|---------|
| Blog | `index.html` | Public homepage |
| Post | `post.html?id=POST_ID` | Single article |
| Login | `login.html` | Admin login |
| Admin | `admin.html` | Write & manage posts |

### Writing a post
1. Go to `login.html` → sign in
2. Click **New Post** in the admin sidebar
3. Write your content using the rich text toolbar
4. Set title, excerpt, category
5. Click **Save Draft** or **Publish**

---

## Features

- ✅ Rich text editor (bold, italic, headings, blockquotes, links, lists)
- ✅ Draft / Publish workflow
- ✅ Category filtering (Fintech / Compliance / Strategy)
- ✅ Newsletter subscribers stored in Firestore
- ✅ Reading progress bar on posts
- ✅ Twitter & LinkedIn share buttons
- ✅ SEO meta tags per post
- ✅ Admin stats dashboard
- ✅ Firebase Auth protected admin
- ✅ Responsive design
