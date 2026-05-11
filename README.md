# 🚀 Vault Anonymous Chat

A real-time, private chat application where users can create a room, share a link, and communicate instantly—without accounts.
Every room is temporary and **self-destructs after 10 minutes** or can be destroyed instantly.

---

## 📖 Introduction

Vault is a minimalist, ephemeral chat platform designed for **privacy-first real-time communication**. Unlike traditional chat apps, there are no accounts, no data retention, and no tracking—just temporary rooms that disappear.

**Core Philosophy:**
> Create a private chat → share link → everything disappears.

### Why Vault?

* **No Sign-Up**: Just create a room and share a link
* **Completely Anonymous**: Users get random names automatically
* **Self-Destructing**: Rooms auto-expire in 10 minutes or instantly destroy
* **Privacy-First**: No accounts, no logs, no tracking
* **Real-Time**: Instant message delivery with WebSockets

---

## 🧱 Tech Stack

### Frontend
* **Next.js 16** (App Router)
* **React 19** (UI framework)
* **Tailwind CSS 4** (styling)
* **Framer Motion** (animations)

### Backend
* **Next.js API Routes** (HTTP endpoints)
* **Node.js WebSocket Server** (real-time messaging)
* **TypeScript** (type safety)

### Infrastructure & Data
* **Upstash Redis** (state management + TTL-based expiry)
* **HTTP Proxy** (dev environment routing)

### Development
* **TSX** (TypeScript executor)
* **ESLint** (code quality)
* **PostCSS** (CSS processing)

---

---

## ✨ Features

### 🔐 Anonymous & Private

* No login required
* Users get a random anonymous name

### ⚡ Real-Time Messaging

* Instant message delivery using WebSockets
* Multiple users in a room

### ⏳ Ephemeral Rooms

* Rooms automatically expire after **10 minutes**
* Redis TTL handles cleanup

### 💣 Destroy Anytime

* “Destroy Now” button instantly deletes:

  * room
  * messages
  * connections

### 🔗 Simple Sharing

* Unique room link
* Anyone with link can join

### 🎞️ Lightweight GIF Support

* Built-in GIPHY API search and trending.
* Zero server storage: sends lightweight GIF URLs via WebSockets instead of uploading files.

---

## 🏗️ Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Next.js App Router + React Components               │  │
│  │  - Chat UI (Messages, Input, Room Info)              │  │
│  │  - Session Storage (participant name, client ID)     │  │
│  │  - WebSocket Client Connection                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         ↕
                    [WebSocket]
                    [HTTP REST]
                         ↕
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Next.js API Routes (HTTP Endpoints)                 │  │
│  │  - POST /api/room/create → Generate room + store    │  │
│  │  - POST /api/room/join → Validate room existence    │  │
│  │  - POST /api/room/destroy → Mark room destroyed     │  │
│  │  - POST /api/room/status → Check room state        │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WebSocket Server (real-time messaging)              │  │
│  │  - Connection handling (per-tab clientId tracking)   │  │
│  │  - Message broadcasting to room participants         │  │
│  │  - Room lifecycle event notifications                │  │
│  │  - Graceful disconnection & reconnection             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         ↕
                    [Redis Protocol]
                         ↕
┌─────────────────────────────────────────────────────────────┐
│            DATA LAYER (Upstash Redis)                       │
│  - room:{roomId} → room state + metadata                   │
│  - room-code:{code} → roomId mapping                       │
│  - TTL: 600 seconds (auto-expiry on inactive rooms)        │
│  - Participant tracking per room                           │
│  - Message history (optional)                              │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Frontend (Next.js App)**
- Page routing and UI rendering
- WebSocket connection lifecycle management
- Message display and input handling
- Session persistence via sessionStorage
- Auto-reconnection on disconnect

**Backend (API Routes)**
- Room creation with unique code generation
- Room validation and access control
- Room destruction and cleanup triggers
- Status monitoring

**Backend (WebSocket Server)**
- Bi-directional real-time communication
- Message distribution to all room participants
- Connection state tracking (per-tab via clientId)
- Room lifecycle event propagation

**Data Layer (Redis)**
- Ephemeral room state storage
- TTL-based automatic cleanup
- Room code → Room ID mapping
- Atomic operations for consistency

---

## 🔄 Workflow & Data Flow

### 1️⃣ **Room Creation Flow**

```
User clicks "Create Room"
    ↓
Frontend calls POST /api/room/create
    ↓
Backend generates:
  - roomId (nanoid)
  - roomCode (4-letter code)
  - participantName (generated client-side)
  - clientId (per-tab UUID)
    ↓
Backend stores in Redis:
  - room:{roomId} = {code, createdAt, participants}
  - room-code:{roomCode} = roomId
  - TTL = 600s (10 minutes)
    ↓
Returns: { roomId, roomCode, participantName }
    ↓
Frontend redirects to: /room/{roomId}
Frontend stores participantName in sessionStorage
```

### 2️⃣ **Room Join Flow**

```
User opens room link: /room/{roomId}
    ↓
Frontend checks sessionStorage:
  - Has participantName? → use it
  - No? → generate new anonymous name
    ↓
Frontend calls POST /api/room/join
  - Validates room exists in Redis
  - Checks TTL (not expired)
  - Adds participant to room state
    ↓
If valid:
  - Store clientId in localStorage (per-tab)
  - Initiate WebSocket connection to /api/ws
  - Send CONNECT event with { roomId, clientId, participantName }
    ↓
If invalid:
  - Show error: "Room not found" or "Room expired"
```

### 3️⃣ **Messaging Flow**

```
User types message & sends
    ↓
Frontend creates:
  {
    type: "MESSAGE",
    roomId,
    clientId,
    participantName,
    content,
    timestamp
  }
    ↓
Sends via WebSocket to server
    ↓
WebSocket server receives message:
  - Validates clientId is in room
  - Stores message in Redis (optional)
  - Broadcasts to ALL clients in room
    ↓
All clients receive:
  - Append message to chat UI
  - Display participant name + content + timestamp
  - Handle scroll-to-latest
    ↓
Sender sees own message after broadcast
```

### 4️⃣ **Room Destruction Flow**

```
User clicks "Destroy Room" button
    ↓
Frontend calls POST /api/room/destroy
  - Body: { roomId }
    ↓
Backend:
  - Marks room as destroyed in Redis
  - Removes from Redis (or sets TTL to 0)
  - Calls internal WebSocket hook: /api/ws/internal/destroy
    ↓
WebSocket server:
  - Broadcasts ROOM_DESTROYED event to all clients in room
    ↓
All clients receive ROOM_DESTROYED:
  - Close WebSocket connection
  - Show UI: "This room has been destroyed"
  - Disable message input
  - Show "Create New Room" button
    ↓
All participants disconnected from room
```

### 5️⃣ **Auto-Expiry Flow (TTL)**

```
Room created with TTL = 600s
    ↓
After 10 minutes: Redis auto-deletes room key
    ↓
Clients don't get notification from Redis (limitation)
  → Must use polling or heartbeat
    ↓
Frontend /api/room/status endpoint (polling):
  - Called every 30-60 seconds
  - If room not found → trigger cleanup UI
    ↓
Client shows: "Room has expired"
Clean up UI state
```

### 6️⃣ **Reconnection Flow**

```
WebSocket disconnects (network issue)
    ↓
Frontend WebSocket error handler:
  - Detects disconnection
  - Stores clientId locally
  - Attempts reconnect with exponential backoff
    ↓
Reconnects successfully:
  - Sends CONNECT again with same clientId
  - Server recognizes clientId → replaces stale connection
  - Avoids duplicate event handling
    ↓
If room destroyed during offline:
  - ROOM_DESTROYED event on reconnect
  - OR status check returns 404
    ↓
Graceful degradation
```

---

---

## 📁 Project Structure

```bash
/app
  /api
    /room
      /create
      /join
      /destroy
  /room/[id]
    page.tsx

/components
  ChatMessages.tsx
  MessageInput.tsx
  DestroyButton.tsx

/hooks
  useChat.ts

/lib
  redis.ts
  ws.ts
```

---

## ⚙️ Environment Variables

Create a `.env.local` file:

```env
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
```

---

## 🧪 How It Works (Quick Reference)

Detailed workflows above. Quick steps:

### 1. Create Room
* Generates unique `roomId` + `roomCode`
* Stores in Redis with 10-minute TTL
* Returns room link to share

### 2. Join Room
* Validates room exists in Redis
* Connects via WebSocket with unique `clientId`
* Loads previous messages (if stored)

### 3. Send Message
* Client sends via WebSocket
* Server validates & broadcasts to all participants
* Clients receive and display in real-time

### 4. Destroy Room
* Any participant can click "Destroy"
* API removes room from Redis immediately
* WebSocket broadcasts `ROOM_DESTROYED` to all
* All clients disconnect and show "room destroyed" UI

### 5. Auto-Expiry
* Redis TTL deletes room after 10 minutes
* Frontend polls `/api/room/status` periodically
* If room not found → triggers cleanup UI

--

---

## 🧠 Design Principles

* **Minimalism over features**
* **Correctness over speed**
* **Ephemeral by default**
* **No unnecessary persistence**

---

## 🚀 Running Locally

```bash
npm install
npm run dev
```

Then open:

```
http://localhost:3000
```



## 🎯 Interview Questions & Answers

**1. Why did you use WebSockets instead of Server-Sent Events (SSE) or Long-Polling?**
**Answer:** A chat application requires real-time, low-latency, *bi-directional* communication. WebSockets keep a persistent connection open, allowing both the client and server to push messages instantly without the heavy overhead of HTTP headers on every request. SSE is strictly one-way (server-to-client), and long-polling wastes server resources and introduces latency.

**2. How do you ensure rooms delete themselves automatically without running complex server cron jobs?**
**Answer:** I utilized **Redis TTL (Time-To-Live)**. When a room is created, its state is stored in Redis with an expiry time of exactly 10 minutes (600 seconds). Redis natively evicts the key from memory once the timer hits zero. The frontend gracefully detects this (either via a lightweight polling fallback or WebSocket disconnection) and shows the "Room Expired" UI.

**3. How did you implement GIF support without slowing down the app or filling up server storage?**
**Answer:** Instead of allowing users to upload heavy `.gif` files to our server, the frontend queries the **GIPHY API** directly. When a user selects a GIF, the app only sends the **image URL string** through the WebSocket. The receiving clients then render an `<Image>` tag pointing to that URL. This keeps payloads tiny (a few bytes), requires zero database storage, and offloads image hosting entirely to Giphy.

**4. How do you handle users temporarily dropping connection (e.g., switching networks on mobile)?**
**Answer:** The frontend generates a unique `clientId` and stores it in `sessionStorage` (which persists across reloads but isolates multiple tabs). If the WebSocket connection drops, the `useChat` hook initiates an automatic reconnection with exponential backoff. When the client reconnects passing its existing `clientId`, the server smartly drops the "stale" socket and replaces it with the new one without treating the user as a brand new participant.

**5. Why are you running a custom Node.js server instead of just relying entirely on Next.js Serverless API routes?**
**Answer:** Standard Next.js serverless functions (like those deployed on Vercel) are stateless and spin down quickly, meaning they cannot host long-lived WebSocket connections. To solve this, I built a custom Node.js server wrapper (`server.ts`). It passes all standard HTTP requests to the Next.js handler, but intercepts any request going to `/api/ws`, explicitly "upgrading" it into a persistent WebSocket connection attached to the Node server.

---

## 📌 Future Improvements

* Better reconnect handling
* Optional room access tokens
* Scalable WebSocket deployment
* Monitoring & logging

---

## 🤝 Contribution

Feel free to:

* improve reliability
* optimize performance
* refine UX

---

## 🧠 Final Note

This project is designed to:

> teach real-time system thinking, not just UI building.

If it “works” but feels inconsistent → you’re not done.

---
