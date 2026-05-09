# 🚀 Vault Anonymous Chat

A real-time, private chat application where users can create a room, share a link, and communicate instantly—without accounts.
Every room is temporary and **self-destructs after 10 minutes** or can be destroyed instantly.

---

## ⚡ Core Idea

> Create a private chat → share link → everything disappears.

This project focuses on:

* **Privacy** (no accounts, no tracking)
* **Ephemerality** (auto-expiry + manual destruction)
* **Real-time communication**

---

## 🧱 Tech Stack

* **Frontend:** Next.js 16 (App Router), Tailwind CSS
* **Backend:** Next.js API routes + WebSocket server
* **Realtime Layer:** WebSockets
* **Data Store:** Upstash Redis

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

---

## 🏗️ Architecture Overview

```text
Frontend (Next.js)
      ↓
WebSocket Server (Node)
      ↓
Upstash Redis (state + TTL)
```

### Responsibilities:

* **Frontend**

  * UI rendering
  * WebSocket connection
  * Message handling

* **WebSocket Server**

  * Real-time communication
  * Broadcast messages
  * Handle room lifecycle events

* **Redis (Upstash)**

  * Room state (`room:{id}`)
  * TTL-based expiry
  * Rate limiting (Phase B)

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

## 🧪 How It Works

### 1. Create Room

* Generates unique `roomId`
* Stores in Redis with TTL (600s)

---

### 2. Join Room

* Validates room existence
* Connects via WebSocket

---

### 3. Messaging

* Client sends message → WS server
* Server broadcasts to all clients

---

### 4. Destroy Room

* API call marks room destroyed
* Broadcasts `"DESTROYED"` event
* All clients disconnect

---

### 5. Expiry

* Redis TTL deletes room
* Clients detect and exit

---

## 🔄 Phases Implemented

### ✅ Phase 1 — Room Lifecycle

* Create / Join / Destroy APIs
* Redis TTL-based rooms

### ✅ Phase 2 — Real-Time Messaging

* WebSocket server
* Message broadcasting

### ✅ Phase 3 — Frontend Integration

* Chat UI
* WebSocket connection
* Destroy handling

---

## 🚧 Remaining Phases

### ⚡ Phase A — Correctness & Consistency

* Handle destroy/message race
* Handle expiry properly
* Prevent duplicate messages
* Clean reconnect logic

---

### ⚡ Phase B — Reliability & Security

* Rate limiting (Redis INCR)
* Input validation
* Spam prevention
* Error handling

---

### ⚡ Phase C — UX & Performance

* Smooth scrolling
* Connection indicators
* Render optimization
* UI polish

---

## ⚠️ Known Challenges

* Redis TTL does not notify clients → must handle manually
* WebSocket lifecycle management is critical
* Race conditions during destroy events

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

---

## 💣 Reality Check

This is not just a “chat app”.

It is:

* a real-time system
* with distributed state
* and ephemeral guarantees

If you ignore edge cases → it will break.

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
