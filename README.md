# Real-Time Chat Platform

A WhatsApp-style messaging app built to explore how a chat system holds up under high message volume. Messages flow through Kafka, presence lives in Redis, media goes to S3-compatible object storage, and a load generator stress-tests the whole pipeline.

Built during my MS in Data Science at the University of the Punjab as a three-person team (see [Team](#team)).

---

## Features

- One-to-one and group chats with real-time delivery over Socket.IO
- Delivered and seen receipts, typing indicators, and online or last-seen presence
- Image sharing and profile pictures
- JWT authentication, bcrypt password hashing, rate limiting and Helmet security headers
- Analytics dashboard: messages per day and per hour, most active users, overall totals
- A load generator that registers test users and sends messages at a set rate

## Architecture

```
React client ──Socket.IO / REST──▶ Express API (Node.js)
                                     │
            ┌────────────────────────┼─────────────────────────┐
            ▼                        ▼                         ▼
     Kafka (message stream)    Redis (presence,          MinIO (media,
            │                   typing, last seen)        S3-compatible)
            ▼
   Batch consumer ──▶ MongoDB (users, chats, messages, analytics)
                      Cassandra (optional time-series analytics)
```

**Why each store:**

| Concern | Technology | Reason |
|---|---|---|
| Message ingestion | Kafka | Absorbs bursts of messages; a consumer writes them to the database in batches of up to 100 |
| Users, chats, messages | MongoDB | Flexible documents for chats, groups and message metadata |
| Presence and typing | Redis | Fast, short-lived keys that expire on their own |
| Media files | MinIO | S3-compatible object storage, kept out of the database |
| Analytics | MongoDB, with optional Cassandra | Counters by day and hour; Cassandra is supported for write-heavy time-series data |

## Tech stack

**Backend:** Node.js, Express, Socket.IO, Mongoose, KafkaJS, Redis, MinIO, cassandra-driver, JWT
**Frontend:** React
**Infrastructure:** Docker Compose (Kafka, Zookeeper, MongoDB, Redis, MinIO)

---

## Run it locally

Requirements: Docker, Node.js 18 or newer.

```bash
# 1. Start Kafka, MongoDB, Redis and MinIO
docker compose up -d

# 2. Start the backend
cd backend
cp .env.example .env      # then set JWT_SECRET to a long random string
npm install
npm start                 # http://localhost:3000

# 3. Start the frontend (new terminal)
cd frontend
npm install
npm start                 # http://localhost:3001 or the next free port
```

The MinIO and database credentials in `docker-compose.yml` and `.env.example` are local development defaults. Change them before running anywhere public.

### Load testing

```bash
cd backend
node src/utils/loadGenerator.js 50 10000 100   # users, messages, messages per second
```

## Repository contents

```
realtime-chat-platform/
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── config/        # Cassandra and MinIO connections
│   │   ├── controllers/   # auth, chats, groups, users
│   │   ├── middleware/    # JWT auth, uploads
│   │   ├── models/        # User, Chat, Group, Message
│   │   ├── routes/        # REST endpoints, incl. analytics, media, presence
│   │   ├── services/      # Kafka producer and consumer, presence, analytics, media
│   │   └── utils/         # load generator, seed scripts
│   └── scripts/           # sample data generation
└── frontend/
    └── src/               # chat, login, register and analytics pages
```

---

## Team

| Member |
|---|
| [Waliya Khan](https://github.com/WaliyaKhan882) |
| [Wosqa Munir](https://github.com/wosqa-munir) |
| [Laiba Imran](https://github.com/laibaimran180803) |
