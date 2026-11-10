# TaskForge — Modern Real-Time Task Management System

**TaskForge** is a production-grade, full-stack task and project management platform built for modern team collaboration and individual productivity. Designed with a clean high-contrast dark/light theme adaptive interface, multi-language internationalization (i18n), and real-time WebSocket synchronization, it delivers an intuitive, fast, and scalable workspace.

---

## 🛠️ Tech Stack

### **Frontend**
* **Framework:** React 18 + TypeScript + Vite
* **Styling:** Tailwind CSS + Lucide Icons
* **State Management:** Zustand (Auth, UI, and Settings stores)
* **Data Fetching:** TanStack Query (React Query)
* **Real-time Engine:** Socket.io Client

### **Backend**
* **Runtime:** Node.js + Express + TypeScript
* **Database & ORM:** PostgreSQL + Prisma ORM
* **Security & Auth:** JWT with rotating HTTP-only refresh tokens & bcrypt password hashing
* **Real-time Server:** Socket.io
* **Role-Based Access Control (RBAC):** Strict 4-role hierarchy (`ADMIN`, `MANAGER`, `EMPLOYEE`, `INDIVIDUAL`)

---

## ✨ Key Features

### 🌐 Multilingual & RTL Support
Built-in i18n support supporting 10 global languages with seamless real-time language switching and full Right-To-Left (RTL) directional layout adaptations for Arabic:
* English (US)
* Bengali (বাংলা)
* Hindi (हिन्दी)
* Arabic (العربية) *(with automatic RTL alignment)*
* Russian (Русский)
* Chinese (中文)
* French (Français)
* Italian (Italiano)
* German (Deutsch)
* Spanish (Español)

### 🌓 Theme Adaptation
* Native Dark & Light theme integration across all UI components, modals, inputs, and interactive surfaces.
* Instant theme switching with system preference detection support.

### ⚡ Real-Time Collaboration
* Instant Socket.io synchronization for task updates, status transitions, member assignments, and inline comments.
* Live online status indicators and automated notification badge counters.

### 📊 Comprehensive Workspaces & Analytics
* **Drag & Drop Kanban Boards:** Custom status columns with WIP limits and fractional reordering.
* **Multi-View System:** Switch between Kanban Board, Structured List View, and Deadline Calendar.
* **Detailed Task Drawers:** Subtasks breakdown, tag management, file attachments, priority markers, and threaded comments.
* **Platform Analytics & Audit Logs:** System-wide activity tracking, workload distribution, resource usage, and immutable security audit logs for Admins.

---

## ⚡ Quick Start & Setup

### Prerequisites
* **Node.js** (`v18.x` or higher)
* **PostgreSQL** (`v14.x` or higher)
* **npm** or **pnpm**

---

### 🚀 Option A: Automated Demo Startup (Fastest)

Run the included shell script from the project root to automatically start PostgreSQL migrations, seed base data, and boot both the backend and frontend servers:

```bash
chmod +x start-demo.sh
./start-demo.sh
```

Once started:
* **Web Client:** `http://localhost:5173`
* **API Endpoint:** `http://localhost:4000`

---

### 🔧 Option B: Manual Setup

#### 1. Clone & Environment Configuration
```bash
git clone https://github.com/your-username/task-management-system.git
cd task-management-system
```

#### 2. Backend Setup
```bash
cd backend

# Create environment configuration
cp .env.example .env

# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Seed initial system configuration (Optional)
npm run prisma:seed

# Start backend development server
npm run dev
```

#### 3. Frontend Setup (In a new terminal)
```bash
cd frontend

# Install dependencies
npm install

# Start Vite frontend development server
npm run dev
```

---

## 🐳 Docker Containerization

To run the complete system stack (Frontend Web App, Express API, and PostgreSQL Database) inside isolated Docker containers:

```bash
docker compose up --build
```

Access the containers at:
* **Frontend Web Application:** `http://localhost:5173`
* **Backend REST API:** `http://localhost:4000`
* **PostgreSQL Database:** `localhost:5432`

---

## 📁 Repository Structure

```text
task-management-system/
├── backend/                  # Node.js + Express + Prisma API
│   ├── prisma/               # Database schema, migrations, and seed scripts
│   └── src/
│       ├── middleware/       # JWT Auth, RBAC guards, rate-limiters
│       ├── routes/           # REST endpoints (auth, users, projects, tasks, audit)
│       ├── services/         # Business logic and database interactions
│       └── realtime/         # Socket.io event emitters and handlers
├── frontend/                 # React 18 + Vite + Tailwind Client
│   └── src/
│       ├── components/       # Reusable primitives, modals, task drawers, layout
│       ├── hooks/            # Custom React Query & Socket hooks
│       ├── lib/              # API wrapper, utils, and i18n translation maps
│       ├── pages/            # View routes (Dashboard, Work, Admin, Analytics)
│       └── store/            # State management via Zustand
├── docs/                     # Architecture, schema, and API specs
├── docker-compose.yml        # Multi-container Docker configuration
└── start-demo.sh             # Automated startup script
```

---

## 🛡️ Security & Access Control

TaskForge implements a strict 2-layer RBAC model:

| Role | Target Scope | Key Privileges |
| :--- | :--- | :--- |
| **`ADMIN`** | Workspace-wide | Full system configuration, user creation/deactivation, privilege elevation, audit logs, and platform metrics. |
| **`MANAGER`** | Project Scope | Project creation, task assignment, workload distribution monitoring, and team management. |
| **`EMPLOYEE`** | Assigned Tasks | Updating status, logging task progress, subtask management, and inline comments. |
| **`INDIVIDUAL`** | Private Workspace | Personal task management with isolated private board views. |

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <sub>Developed by <b>Nazmul Amin</b></sub>
</div>