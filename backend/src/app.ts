import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import projectsRoutes from './routes/projects.routes';
import tasksRoutes from './routes/tasks.routes';
import commentsRoutes from './routes/comments.routes';
import notificationsRoutes from './routes/notifications.routes';
import analyticsRoutes from './routes/analytics.routes';
import auditRoutes from './routes/audit.routes';
import uploadsRoutes from './routes/uploads.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.clientOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', service: 'taskforge-api', env: config.env, time: new Date().toISOString() }),
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api', commentsRoutes); // /api/tasks/:taskId/comments, /api/comments/:id
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/uploads', uploadsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
