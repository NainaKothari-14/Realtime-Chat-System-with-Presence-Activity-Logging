const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const Redis = require("ioredis");
const { Kafka } = require("kafkajs");

process.env.KAFKAJS_NO_PARTITIONER_WARNING = "1";//Suppress partitioner warning

//App Setup
const app = express();
const server = http.createServer(app);//Create HTTP server

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

//MongoDB Setup
mongoose.connect("mongodb://127.0.0.1:27017/chat-app")
  .then(() => console.log("🥳MongoDB connected"))
  .catch(console.error);

const MessageSchema = new mongoose.Schema({//Schema for chat messages
  roomId: String,
  userId: String,
  text: String,
  reactions: { type: Map, of: [String], default: {} }
}, { timestamps: true });

const Message = mongoose.model("Message", MessageSchema);//Message model

//Redis Setup
const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null
});

redis.on("error", err =>
  console.error("Redis error (ignored):", err.message)
);

//Kafka
let producer = null;
try {
  const kafka = new Kafka({
    clientId: "chat-server",
    brokers: ["localhost:9092"]
  });
  producer = kafka.producer();
  producer.connect().then(() =>
    console.log("Kafka producer connected")
  );
} catch {
  console.log("Kafka not running (safe to ignore)");
}

const logActivity = async (type, payload) => {
  if (!producer) return;
  try {
    await producer.send({
      topic: "activity-log",
      messages: [{ value: JSON.stringify({ type, payload }) }]
    });
  } catch {}
};

// Helper function to create consistent DM room ID
const getDMRoomId = (userId1, userId2) => {
  return [userId1, userId2].sort().join("_");
};

//Socket.io Setup
const io = new Server(server, {
  cors: { origin: "http://localhost:5173" }
});

io.on("connection", async (socket) => {
  const userId = socket.handshake.query.userId;
  if (!userId) return socket.disconnect();

  console.log("🟢 Connected:", userId);

  // Set user online
  await redis.hset("users", userId, "online");
  
  // Get all online users
  const allUsers = await redis.hgetall("users");
  
  // Send ALL users to this newly connected user
  socket.emit("users:sync", allUsers);
  
  // Tell everyone else this user just came online
  socket.broadcast.emit("user:online", { userId, status: "online" });

//Join a group chat room
  socket.on("joinRoom", async (roomId) => {
    socket.join(roomId);

    const history = await Message
      .find({ roomId })
      .sort({ createdAt: 1 })
      .limit(50);

    socket.emit("previousMessages", history);//Send last 50 messages
  });

//Group chat message
  socket.on("message", async ({ roomId, text }) => {
    const msg = await Message.create({ roomId, userId, text });

    io.to(roomId).emit("message", {//Broadcast to room
      userId,
      text,
      timestamp: msg.createdAt,
      id: msg._id.toString(),
      reactions: Object.fromEntries(msg.reactions)//Convert Map to object
    });

    logActivity("message", { roomId, userId, text });//Log activity
  });

//React to group message
  socket.on("reactMessage", async ({ messageId, emoji }) => {
    // Validate messageId
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      console.error("Invalid messageId for reaction:", messageId);
      return;
    }

    const msg = await Message.findById(messageId);
    if (!msg) return;

    if (!msg.reactions.has(emoji)) msg.reactions.set(emoji, []);
    
    const emojiUsers = msg.reactions.get(emoji);//Get users who reacted with this emoji
    const userIndex = emojiUsers.indexOf(userId);//Check if user already reacted
    
    if (userIndex === -1) {//Add reaction
      emojiUsers.push(userId);//Add user to emoji reaction list
    } else {
      emojiUsers.splice(userIndex, 1);//Remove reaction
    }

    if (emojiUsers.length === 0) {//No users left for this emoji
      msg.reactions.delete(emoji);//Remove emoji entry
    } else {
      msg.reactions.set(emoji, emojiUsers);//Update emoji users list
    }

    await msg.save();

    io.to(msg.roomId).emit("updateReaction", {//Broadcast updated reactions
      messageId: msg._id.toString(),
      reactions: Object.fromEntries(msg.reactions)//Convert Map to object
    });
  });

  //Typing indicators for group chat
  socket.on("typing", ({ roomId }) =>//User started typing
    socket.to(roomId).emit("typing", { userId })
  );

  socket.on("stopTyping", ({ roomId }) =>
    socket.to(roomId).emit("stopTyping")
  );

  //DM typing indicator
  socket.on("dmTyping", ({ toUserId }) => {//User started typing in DM
    for (const s of io.sockets.sockets.values()) {
      if (s.handshake.query.userId === toUserId) {//Find recipient socket
        s.emit("dmTyping", { fromUserId: userId });//Notify recipient
      }
    }
  });

  //Direct Message
  socket.on("dmMessage", async ({ toUserId, text }) => {
    const dmRoomId = getDMRoomId(userId, toUserId);

    const msg = await Message.create({//Save DM message
      roomId: dmRoomId,
      userId,
      text
    });

    const payload = {
      fromUserId: userId,
      toUserId,
      text,
      timestamp: msg.createdAt,
      id: msg._id.toString(),
      reactions: Object.fromEntries(msg.reactions)
    };

    // Send to sender (so they see their own message with proper ID)
    socket.emit("dmMessage", payload);

    // Send to receiver if online
    for (const s of io.sockets.sockets.values()) {
      if (s.handshake.query.userId === toUserId) {
        s.emit("dmMessage", payload);
      }
    }

    logActivity("dmMessage", payload);
  });

  //Dm reactions
  socket.on("dmReaction", async ({ messageId, emoji, toUserId }) => {
    // Validate messageId
    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      console.error("Invalid messageId for DM reaction:", messageId);
      return;
    }

    const msg = await Message.findById(messageId);//Find the DM message
    if (!msg) return;

    if (!msg.reactions.has(emoji)) msg.reactions.set(emoji, []);//Initialize emoji array if needed
    
    const emojiUsers = msg.reactions.get(emoji);
    const userIndex = emojiUsers.indexOf(userId);
    
    if (userIndex === -1) {
      emojiUsers.push(userId);//Add reaction
    } else {
      emojiUsers.splice(userIndex, 1);//Remove reaction
    }

    if (emojiUsers.length === 0) {
      msg.reactions.delete(emoji);//Remove emoji if no users left
    } else {
      msg.reactions.set(emoji, emojiUsers);//Update emoji users list
    }

    await msg.save();

    const reactionPayload = {
      messageId: msg._id.toString(),
      reactions: Object.fromEntries(msg.reactions),
      otherUserId: toUserId
    };

    socket.emit("dmReactionUpdate", reactionPayload);
    
    for (const s of io.sockets.sockets.values()) {
      if (s.handshake.query.userId === toUserId) {
        s.emit("dmReactionUpdate", {
          ...reactionPayload,
          otherUserId: userId
        });
      }
    }
  });

  //Loads previous DMs with a specific user
  socket.on("loadDMs", async ({ otherUserId }) => {
    const dmRoomId = getDMRoomId(userId, otherUserId);

    console.log(`Loading DMs for ${userId} ↔ ${otherUserId} (room: ${dmRoomId})`);

    const history = await Message
      .find({ roomId: dmRoomId })
      .sort({ createdAt: 1 });

    console.log(`Found ${history.length} messages`);

    socket.emit("previousDMs", {//Send previous DMs
      otherUserId,
      messages: history.map(m => ({
        id: m._id.toString(),
        fromUserId: m.userId,
        toUserId: m.userId === userId ? otherUserId : userId, // Ensure toUserId is always set
        text: m.text,
        timestamp: m.createdAt,
        reactions: Object.fromEntries(m.reactions)
      }))
    });
  });

  //Disconnect
  socket.on("disconnect", async () => {
    console.log("Disconnected:", userId);//User disconnected

    // Set user offline
    
    await redis.hdel("users", userId);
    
    // Tell everyone this user went offline
    io.emit("user:offline", { userId });
  });
});

//Start server
server.listen(5000, () =>
  console.log("🚀 Server running on http://localhost:5000")
);