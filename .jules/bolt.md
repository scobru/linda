## 2026-04-27 - Memoization of List Items
**Learning:** In highly interactive components like `ChatView` (which re-renders frequently due to typing statuses) or `Sidebar`, children that are rendered in large loops (like `UserAvatar` or message text processing) are major bottlenecks if not memoized.
**Action:** Always use `React.memo` for list items or expensive sub-components (like those doing regex parsing or DB subscriptions) when used within `map()` functions.
