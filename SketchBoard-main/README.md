# ✏️ Chat-Chalk - A Real-Time Collaborative Whiteboard

**Chat-Chalk** is a modern full-stack collaborative whiteboard application inspired by digital brainstorming tools. It enables multiple users to draw, brainstorm, and collaborate together in real time through synchronized canvases powered by WebSockets.

Built with a scalable monorepo architecture, Chat-Chalk focuses on low-latency collaboration, secure authentication, persistent storage, and a clean user experience.

---

## ✨ Key Features

- **🎨 Real-Time Collaboration**  
  Draw together with multiple users in real time. Every drawing, shape, and erasing action is instantly synchronized across connected clients using WebSockets.

- **🖍️ Complete Drawing Toolkit**  
  Includes smooth freehand drawing, Rectangle and Circle tools, along with an intelligent eraser that removes complete strokes.

- **💾 Persistent Whiteboards**  
  Whiteboard data is stored in PostgreSQL using Prisma ORM, allowing users to resume their work anytime.

- **🔐 Secure Authentication**  
  JWT-based authentication with secure `httpOnly` cookies and protected WebSocket connections.

- **⚡ High Performance**  
  Uses in-memory state management on the WebSocket server to minimize latency and ensure consistent collaboration.

- **📱 Responsive User Interface**  
  Built with Next.js 14 App Router and Tailwind CSS v4 featuring a clean, responsive interface with Light and Dark mode support.

- **🏗️ Scalable Monorepo Architecture**  
  Developed using Turborepo with shared packages for UI components, validation schemas, and backend utilities.

---

## 🚀 Tech Stack

### Monorepo
- Turborepo

### Frontend
- Next.js 14 (App Router)
- React
- TypeScript
- Tailwind CSS v4
- Framer Motion

### Backend
- Node.js
- Express.js

### Real-Time Communication
- WebSockets (`ws`)

### Database
- PostgreSQL
- Prisma ORM

### Authentication
- JWT
- cookie-parser

### Shared Packages
- `@repo/ui`
- `@repo/common`
- `@repo/backend-common`

---

## ⚙️ Running Locally

### Prerequisites

Make sure you have installed:

- Node.js (v18 or later)
- PostgreSQL
- npm

---

### 1. Clone the Repository

```bash
git clone https://github.com/Manncode23/Chat-Chalk.git

cd Chat-Chalk
```

---

### 2. Install Dependencies

```bash
npm install
```

---

### 3. Configure Environment Variables

Create a `.env` file inside the `packages/db` directory.

```bash
cp packages/db/.env.example packages/db/.env
```

Update the database connection:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/chatchalk"
```

Create `.env` files inside:

```
apps/http-server
apps/ws-server
```

Add:

```env
JWT_SECRET=your_secret_key
```

---

### 4. Push the Database Schema

```bash
npm run db:push
```

---

### 5. Start the Development Servers

```bash
npm run dev
```

---

## 🌐 Local URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3001 |
| HTTP Server | http://localhost:3005 |
| WebSocket Server | ws://localhost:8080 |

---

## 📂 Project Structure

```text
Chat-Chalk/
│
├── apps/
│   ├── draw-fe
│   ├── http-server
│   └── ws-server
│
├── packages/
│   ├── db
│   ├── ui
│   ├── common
│   └── backend-common
│
├── package.json
├── turbo.json
└── README.md
```

---

## 📸 Demo

> Add screenshots or a GIF showcasing:
>
> - Real-time collaborative drawing
> - Multiple users editing simultaneously
> - Whiteboard tools
> - Light/Dark mode

---

## 🔮 Future Enhancements

- 💬 Real-time Chat
- 👥 Cursor Presence
- ↩️ Undo / Redo
- 📤 Export as PNG/PDF
- 📁 File Sharing
- 🎙️ Voice & Video Collaboration
- 🤖 AI-powered Whiteboard Assistant

---

## 📄 License

This project is licensed under the MIT License.
