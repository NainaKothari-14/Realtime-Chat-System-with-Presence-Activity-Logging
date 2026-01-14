# 💬 Realtime Chat System

A production-ready real-time chat application built with Socket.IO, Redis, MongoDB, Kafka, and Elasticsearch. Features instant messaging, user presence tracking, typing indicators, and comprehensive activity logging.

<img src="screenshots/RealTimeCHatInterface.png" width="400" alt="Chat Interface">

## ✨ Features

- **Real-time Messaging** - Instant message delivery using Socket.IO
- **Direct Messages** - Private 1-to-1 conversations
- **User Presence** - Live online/offline status tracking with Redis
- **Typing Indicators** - See when other users are typing
- **Message Persistence** - Chat history stored in MongoDB
- **Activity Logging** - Asynchronous event logging with Kafka and Elasticsearch
- **User Discovery** - Order-independent user registry

## 🏗️ Architecture

```
Frontend: React + Socket.IO + Recharts + Tailwind CSS
Backend: Node.js + Express + Socket.IO
Storage: Redis (presence) + MongoDB (messages) + Kafka (logs) + Elasticsearch (analytics)
```

## 📸 Screenshots

### Login
<img src="screenshots/UsernamePAge.png" width="350" alt="Username Entry">

### Chat Room
<img src="screenshots/RealTimeCHatInterface.png" width="400" alt="Real-time Chat">

### Typing Indicator
<img src="screenshots/TypingIndicator.png" width="400" alt="Typing Status">

### Online Presence
<img src="screenshots/LiveOnline_OfflinePresenceTracking.png" width="400" alt="User Presence">

### Message Sync
<img src="screenshots/MessageSynchronization.png" width="400" alt="Message Sync">

### Direct Messages
<img src="screenshots/1-to-1Chat.png" width="400" alt="Direct Messages">

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+)
- Docker & Docker Compose

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/realtime-chat-system.git
cd realtime-chat-system

# Install dependencies
npm install

# Start infrastructure services (Redis, Kafka, Elasticsearch)
docker-compose up -d

# Start backend server
node server.js

# Start frontend (in new terminal)
npm run dev
```

The application will be available at `http://localhost:5173`

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| Socket.IO | Real-time bidirectional communication |
| Redis | User presence & fast in-memory state |
| MongoDB | Persistent message storage |
| Kafka | Asynchronous activity logging |
| Elasticsearch | Searchable activity logs & analytics |
| React | Frontend UI |
| Tailwind CSS | Styling |

## 📋 Key Learnings

### User Discovery Problem
Initially faced issues where DMs only worked if users joined in a specific order. 

**Solution**: Implemented a persistent user registry in Redis where:
- All users are stored permanently (not deleted on disconnect)
- User status updates to "offline" instead of being removed
- Consistent DM room IDs using sorted user IDs: `[userId1, userId2].sort().join("_")`

This made the system order-independent and fully functional.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built as a learning project to understand real-time systems, presence management, and event-driven architectures.

---

⭐ Star this repo if you found it helpful!
