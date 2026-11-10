import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { connectSocket, disconnectSocket, useSocketEvent } from '@/hooks/useSocket';
import { AppShell } from '@/components/layout/AppShell';
import { TaskDetailDrawer } from '@/components/task/TaskDetailDrawer';
import { Skeleton } from '@/components/ui/primitives';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';

const ProjectsPage = lazy(() => import('@/pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ProjectPage = lazy(() => import('@/pages/ProjectPage').then((m) => ({ default: m.ProjectPage })));
const MyWorkPage = lazy(() => import('@/pages/MyWorkPage').then((m) => ({ default: m.MyWorkPage })));
const CalendarPage = lazy(() => import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })));
const AdminAuditPage = lazy(() => import('@/pages/admin/AdminAuditPage').then((m) => ({ default: m.AdminAuditPage })));
const AdminAnalyticsPage = lazy(() => import('@/pages/admin/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage })));

const PageFallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-8 w-52" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
    </div>
    <Skeleton className="h-72 w-full" />
  </div>
);

/** Requires an authenticated principal; also boots the socket connection once. */
function ProtectedShell() {
  const { status, user } = useAuthStore();
  const qc = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated') return;
    const socket = connectSocket();
    return () => {
      disconnectSocket();
      void socket;
    };
  }, [status]);

  // Any realtime notification invalidates the notification feed.
  useSocketEvent('notification:new', () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
  });
  useSocketEvent('task:created', () => {
    void qc.invalidateQueries({ queryKey: ['my-work'] });
  });

  const location = useLocation();
  if (status === 'idle' || status === 'loading') return <PageFallback />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === 'idle') void bootstrap();
  }, [status, bootstrap]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedShell />}>
          <Route
            path="/"
            element={
              <Suspense fallback={<PageFallback />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route path="/my-work" element={<Suspense fallback={<PageFallback />}><MyWorkPage /></Suspense>} />
          <Route path="/projects" element={<Suspense fallback={<PageFallback />}><ProjectsPage /></Suspense>} />
          <Route path="/projects/:projectId" element={<Suspense fallback={<PageFallback />}><ProjectPage /></Suspense>} />
          <Route path="/calendar" element={<Suspense fallback={<PageFallback />}><CalendarPage /></Suspense>} />
          <Route path="/notifications" element={<Suspense fallback={<PageFallback />}><NotificationsPage /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
          <Route path="/admin/users" element={<RequireAdmin><Suspense fallback={<PageFallback />}><AdminUsersPage /></Suspense></RequireAdmin>} />
          <Route path="/admin/audit" element={<RequireAdmin><Suspense fallback={<PageFallback />}><AdminAuditPage /></Suspense></RequireAdmin>} />
          <Route path="/admin/analytics" element={<RequireAdmin><Suspense fallback={<PageFallback />}><AdminAnalyticsPage /></Suspense></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <TaskDetailDrawer />
    </>
  );
}
