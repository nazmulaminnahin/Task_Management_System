export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'INDIVIDUAL';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'CANCELLED';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
export type ProjectType = 'TEAM' | 'PERSONAL';
export type ProjectRole = 'LEAD' | 'MEMBER' | 'VIEWER';
export type AccessLevel = 'VIEW' | 'EDIT' | 'MANAGE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  emailNotifications: boolean;
  createdAt: string;
  lastSeenAt?: string | null;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  visibility: 'PRIVATE' | 'TEAM';
  color: string;
  startDate: string | null;
  dueDate: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string; avatarUrl: string | null };
  _count: { tasks: number; members: number };
}

export interface ProjectMember extends Omit<User, 'isActive' | 'emailNotifications' | 'createdAt'> {
  projectRole: ProjectRole;
  joinedAt: string;
}

export interface BoardColumn {
  id: string;
  boardId: string;
  name: string;
  status: TaskStatus;
  position: number;
  wipLimit: number | null;
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  columns: BoardColumn[];
}

export interface Tag {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  isDone: boolean;
  position: number;
}

export interface Assignee {
  userId: string;
  assignedAt?: string;
  user: { id: string; name: string; email?: string; avatarUrl: string | null };
}

export interface Task {
  id: string;
  projectId: string;
  boardId: string | null;
  columnId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimateMins: number | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  progress: number;
  assignees: Assignee[];
  subtasks: Subtask[];
  tags: Tag[];
  _count?: { comments: number; attachments: number };
  project?: { id: string; name: string; key: string; color: string };
}

export interface CommentAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
  role?: Role;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  author: CommentAuthor;
  mentions?: { userId: string }[];
  replies?: Comment[];
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  createdBy: { id: string; name: string; avatarUrl: string | null };
  comments: Comment[];
  attachments: Attachment[];
  timeEntries: Array<{ id: string; minutes: number; note: string | null; startedAt: string; user: { id: string; name: string } }>;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ProjectWorkspace {
  project: Omit<ProjectSummary, 'owner' | '_count'>;
  accessLevel: AccessLevel;
  members: ProjectMember[];
  boards: Board[];
  tags: Tag[];
  taskCounts: Record<TaskStatus, number>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface SocketEvent<T = unknown> {
  payload: T;
  actorId?: string;
  at: number;
}
