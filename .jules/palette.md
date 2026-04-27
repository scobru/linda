## 2026-04-27 - [Accessibility & Confirmation]
**Learning:** Icon-only buttons in the chat interface were lacking ARIA labels, making them unusable for screen reader users. Additionally, destructive actions like clearing chat history were executed immediately without confirmation, leading to potential accidental data loss.
**Action:** Always add `aria-label` to icon-only buttons and implement `window.confirm` for destructive or security-sensitive actions in the UI. Add tooltips (via `title`) to explain the state of disabled buttons.
