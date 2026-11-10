import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import { asyncHandler } from '../lib/http';
import { badRequest, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getProjectAccess, getTaskAccess } from '../services/access.service';
import { emitToProject } from '../realtime/io';

const router = Router();
router.use(authenticate);

fs.mkdirSync(config.uploads.dir, { recursive: true });

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploads.dir),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname).slice(0, 12).replace(/[^.a-z0-9]/gi, '');
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: { fileSize: config.uploads.maxBytes, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(badRequest(`Unsupported file type: ${file.mimetype}`));
    cb(null, true);
  },
});

/** POST /api/uploads/tasks/:taskId — multipart, field name "files" (≤5, ≤10 MB each). */
router.post(
  '/tasks/:taskId',
  upload.array('files', 5),
  asyncHandler(async (req, res) => {
    const { task, access } = await getTaskAccess(req.user!.id, req.user!.role, req.params.taskId, 'EDIT');
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('No files received');

    const attachments = await prisma.$transaction(
      files.map((file) =>
        prisma.attachment.create({
          data: {
            taskId: task.id,
            uploaderId: req.user!.id,
            fileName: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storageKey: path.basename(file.path),
          },
        }),
      ),
    );

    emitToProject(access.project.id, 'attachment:created', { taskId: task.id, attachments });
    res.status(201).json({ attachments });
  }),
);

/**
 * GET /api/uploads/:storageKey — authenticated download.
 * In production this route 302s to a short-lived S3 signed URL instead;
 * keeping it behind auth is what makes local-disk storage safe in dev.
 */
router.get(
  '/:storageKey',
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findUnique({
      where: { storageKey: req.params.storageKey },
      include: { task: { select: { projectId: true } }, comment: { select: { task: { select: { projectId: true } } } } },
    });
    if (!attachment) throw notFound('Attachment not found');
    const projectId = attachment.task?.projectId ?? attachment.comment?.task.projectId;
    if (!projectId) throw notFound('Attachment not found');
    await getProjectAccess(req.user!.id, req.user!.role, projectId);

    const filePath = path.join(config.uploads.dir, attachment.storageKey);
    if (!fs.existsSync(filePath)) throw notFound('File missing from storage');
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
    fs.createReadStream(filePath).pipe(res);
  }),
);

/** DELETE /api/uploads/:id */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) throw notFound('Attachment not found');
    if (attachment.taskId) {
      const { access } = await getTaskAccess(req.user!.id, req.user!.role, attachment.taskId, 'EDIT');
      if (attachment.uploaderId !== req.user!.id && access.level === 'VIEW' && req.user!.role !== 'ADMIN') {
        throw badRequest('Insufficient permission to delete this attachment');
      }
    }
    await prisma.attachment.delete({ where: { id: attachment.id } });
    fs.rm(path.join(config.uploads.dir, attachment.storageKey), { force: true }, () => undefined);
    res.status(204).send();
  }),
);

export default router;
