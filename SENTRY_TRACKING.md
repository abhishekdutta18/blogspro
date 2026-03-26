# Sentry Button Tracking Process

To ensure high-quality monitoring and error resolution, BlogsPro tracks all significant UI interactions using Sentry Breadcrumbs.

## 1. Automatic Tracking (Global)
All standard `button` elements and common action classes (e.g., `.v2-btn-top`) are **automatically** tracked by the global listener in `js/main.js`.
- **Label**: The tracking label is derived from the button's text (trimmed to 30 chars).
- **Metadata**: Click context (ID, classes, tag) is automatically included.

## 2. Manual Tracking (High Importance)
For complex workflows where text-based tracking is insufficient, use the `trackAction` helper from `js/utils.js`.

```javascript
import { trackAction } from "./utils.js";

// Inside an event handler
trackAction('ai-table-generated', { 
  rowCount: 10, 
  topic: 'Finance' 
});
```

## 3. Custom Labels for Future Buttons
To override the automatic text-based label, add the `data-sentry-label` attribute to any clickable element.

```html
<button data-sentry-label="publish-post-sidebar">
  🚀 Go Live
</button>
```

## Benefits
- **Better Debugging**: When an error occurs, the Sentry Breadcrumbs will show the exact sequence of button clicks leading up to the failure.
- **Usage Insights**: We can see which features are most used without heavy analytics tools.
