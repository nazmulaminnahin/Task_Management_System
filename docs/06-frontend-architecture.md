# Frontend Architecture, Component Tree & State Strategy

## 1. Provider tree

```
<React.StrictMode>
  <QueryClientProvider client={queryClient}>        // TanStack Query: server state
    <BrowserRouter>                                 // route tree
      <App>                                         // bootstraps auth from refresh cookie
        <Routes>
          /login → <LoginPage/>
          <ProtectedShell>                          // auth guard + socket lifecycle + AppShell
            "/"                     → <DashboardPage/>        (role-switched)
            /my-work                → <MyWorkPage/>
            /projects               → <ProjectsPage/>
            /projects/:projectId    → <ProjectPage/>
            /calendar               → <CalendarPage/>
            /notifications          → <NotificationsPage/>
            /settings               → <SettingsPage/>
            /admin/users            → <RequireAdmin><AdminUsersPage/></RequireAdmin>
            /admin/audit            → <RequireAdmin><AdminAuditPage/></RequireAdmin>
            /admin/analytics        → <RequireAdmin><AdminAnalyticsPage/></RequireAdmin>
          </ProtectedShell>
        </Routes>
        <TaskDetailDrawer/>                          // global overlay, any route can open it
      </App>
    </BrowserRouter>
  </QueryClientProvider>
</React.StrictMode>
```

Pages other than Login/Dashboard are `React.lazy` chunks; `Admin*` routes are also gated by `<RequireAdmin>`.

## 2. Layout tree (authenticated)

```
AppShell
├─ Sidebar (collapsible, persisted)
│  ├─ brand
│  ├─ primary nav        Dashboard · My work · Projects · Calendar
│  ├─ admin nav           Users & roles · Audit log · Platform analytics (ADMIN only)
│  └─ project shortcuts   up to 6, colour-coded
├─ Topbar
│  ├─ ⌘K GlobalSearch (modal)
│  ├─ connection pill     Live / Offline (socket status)
│  ├─ NotificationBell → NotificationPanel (popover)
│  └─ avatar → /settings · sign out
└─ <Outlet/>  → page content
```

## 3. Page-level composition

```
ProjectPage
├─ header            key chip, name, status, accessLevel badge, owner avatar stack
│  ├─ progress bar + done/total + due date
│  └─ view switch (Board | List | Calendar) + tab switch (Workspace | Insights | Members)
├─ filter bar        search · assignee select · priority select · clear
├─ Workspace
│  ├─ KanbanBoard     dnd-kit · columns from workspace.boards[0].columns
│  │  ├─ KanbanColumn (droppable, WIP badge)
│  │  │  └─ SortableTaskCard → TaskCardView
│  │  └─ DragOverlay → TaskCardView (isActive)
│  ├─ TaskListView    group-by status/priority/assignee, sortable columns
│  └─ CalendarView    month grid, up to 3 chips/day, overdue tint
├─ Insights (Recharts)  status pie · priority bars · team workload cards
├─ Members               role table
└─ CreateTaskModal       title, markdown, column, priority, due, assignees, tags
```

```
TaskDetailDrawer  (mounted once at app root; reads ui.store.openTaskId)
├─ header      project chip · short id · inline-editable title · delete · close
├─ status + priority selects · due badge · progress bar
├─ description   Markdown preview  ⇄  textarea edit
├─ subtasks      checkbox list + add/remove (PATCH replaces the set)
├─ attachments   list + upload (multipart)
├─ tabs          Comments (threaded, @mention picker)  |  Activity (GET /tasks/:id/activity)
└─ right rail    assignee toggles · tag chips + inline create · start/due/created · logged time
```

## 4. State ownership

| State | Owner | Persistence | Notes |
|---|---|---|---|
| Principal (user, role) | Zustand `auth.store` | none (rehydrated via refresh cookie) | `status` machine drives route guards |
| Access token | module variable in `lib/api.ts` | **memory only** | XSS hardening; re-minted by single-flight refresh |
| Board view mode, sidebar collapse | Zustand `ui.store` | `localStorage` (`taskforge:ui`) | small, non-sensitive preferences |
| Open task (drawer) | Zustand `ui.store` | none | global so any page/deep link can open it |
| Projects, workspaces, tasks, comments, analytics, notifications, audit, users | TanStack Query | in-memory cache | keys are hierarchical; socket events patch them |
| Drag preview / column regrouping | dnd-kit + local `useState` in `KanbanBoard` | none | local until drop, then server truth |
| Form drafts (title, description, subtask) | component `useState` | none | committed with optimistic PATCH |

**Rule of thumb:** anything the server can answer is Query state; anything that describes *this tab's* UI is Zustand; anything that lives until the next re-render is `useState`.

## 5. Query key map

```ts
['projects', scope]                     ['project', id]
['tasks', projectId, filterSignature]   ['task', id]         ['task-activity', id]
['my-work']                             ['calendar-tasks']   ['search-tasks', q]
['analytics', 'admin' | 'me' | 'workload' | 'project', id]
['notifications']                       ['sessions']
['admin-users', q, role]                ['audit', action, page]
```

Invalidation strategy: mutations invalidate the narrowest prefix that contains their effect (e.g. `useCreateTask` → `['tasks', projectId]`, `['project', projectId]`, `['my-work']`); socket events **patch** instead of invalidating on the hot path (`task:moved`), and only invalidate for comment threads and project counters.

## 6. Real-time wiring

```ts
// src/hooks/useSocket.ts — one socket per tab
io({ path: '/socket.io', auth: (cb) => cb({ token: tokenStore.get() ?? '' }) });

// src/pages/ProjectPage.tsx — cache patches
useSocketEvent('task:moved', (p) => patchTaskLists(items =>
  items.map(t => t.id === p.id ? { ...t, status: p.status, columnId: p.columnId, position: p.position, progress: p.progress } : t)));

useSocketEvent('task:created', (p) => patchTaskLists(items => items.some(t => t.id === p.id) ? items : [...items, p]));
useSocketEvent('task:updated', (p) => patchTaskLists(items => items.map(t => t.id === p.id ? { ...t, ...p } : t)));
useSocketEvent('task:deleted', (p) => patchTaskLists(items => items.filter(t => t.id !== p.id)));

// src/App.tsx — global feeds
useSocketEvent('notification:new', () => qc.invalidateQueries({ queryKey: ['notifications'] }));
useSocketEvent('task:created',     () => qc.invalidateQueries({ queryKey: ['my-work'] }));
```

Self-echo suppression is intentional: the actor already applied an optimistic patch, and the server payload carries `actorId` if a component wants to skip it.

## 7. Drag & drop implementation notes

- **Sensors:** `PointerSensor` with 5 px activation distance (so clicks still open the drawer), `KeyboardSensor` for accessibility.
- **Collision detection:** `pointerWithin → rectIntersection → closestCorners` — natural nesting, with a keyboard fallback.
- **Cross-column preview:** `onDragOver` moves the card into the hovered column locally, so the drop target and gap are accurate before release.
- **On drop:** read the neighbours *after* reordering (`beforeId`, `afterId`) and send one `PATCH /tasks/:id/move`.
- **On failure:** `onDragCancel` (or a failed mutation) re-derives state from the server query, so the board never drifts.
- **Optimism:** the cache is patched immediately with the new `status/columnId`, then the authoritative rows arrive via REST/socket.

## 8. Design system

Tailwind with semantic tokens — `brand.{50..900}`, `ink{,-muted,-faint}`, `surface{,-muted,-border}` — plus component classes (`.card`, `.btn-*`, `.input`, `.chip`) defined once in `index.css`. Primitives in `components/ui/primitives.tsx`: Button (5 variants × 3 sizes, loading state), Input/Textarea/Select/Label, Badge, Avatar + AvatarStack, Modal, Skeleton, EmptyState, ProgressBar, SegmentedControl. Icons are Lucide only. Charts share one tooltip style for visual consistency.

## 9. Accessibility & UX guardrails

- Every interactive icon button has an `aria-label`; modals use `role="dialog" aria-modal="true"` and close on Escape.
- Focus is moved to the first field when a modal opens (`autoFocus`).
- Colour is never the only signal: priority carries a dot **and** a label; overdue uses text (`3d overdue`) as well as red.
- Keyboard: ⌘K search, ⌘↵ to send a comment, Space/Escape/arrows on dnd-kit's keyboard sensor.
- Loading states are skeletons sized like the real content, so layouts don't jump.
