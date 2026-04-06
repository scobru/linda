## 2024-03-08 - [Unmemoized Unread Count Calculation]
**Learning:** `App.tsx` calculates unread messages within `contacts.map` on every single render using `(messages[c] || []).filter(...).length`. This is an O(N * M) operation inside the render cycle (N = contacts, M = messages per contact) which causes massive CPU spikes during typing or receiving messages.
**Action:** Lift the calculation of unread counts into a `useMemo` block outside the render cycle to only recalculate when `messages` change, then lookup by contact key.
