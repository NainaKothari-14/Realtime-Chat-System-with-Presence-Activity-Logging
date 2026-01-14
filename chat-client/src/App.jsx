import { useRef, useState, useEffect } from "react";
import io from "socket.io-client";
import { Send, Users, Circle, MessageCircle, X, Smile } from "lucide-react";

const ROOM_ID = "room3";//Static room ID for group chat
const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export default function App() {
  const [socket, setSocket] = useState(null);
  const [userId, setUserId] = useState("");//Username input before connecting
  const [connected, setConnected] = useState(false);//Connection status

  const [users, setUsers] = useState({}); 
  const [messages, setMessages] = useState([]);//Group chat messages
  const [typingUser, setTypingUser] = useState(null);//Who is typing indicator
  const [text, setText] = useState("");//Message input text

  // DM state
  const [activeChat, setActiveChat] = useState("room"); // "room" or userId for DM
  const [dmMessages, setDmMessages] = useState({}); // { userId: [...messages] }
  const [dmTyping, setDmTyping] = useState({}); // { userId: true/false }

  // Reaction state
  const [showEmojiPicker, setShowEmojiPicker] = useState(null); // messageId

  const typingTimeout = useRef(null);//Timeout for typing indicator
  const messagesEndRef = useRef(null);//Ref for auto-scrolling

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, dmMessages, activeChat]);

  // Load DM history when switching to a DM chat
  useEffect(() => {
    if (socket && activeChat !== "room" && connected) {
      console.log(`Requesting DM history with ${activeChat}`);
      socket.emit("loadDMs", { otherUserId: activeChat });
    }
  }, [activeChat, socket, connected]);

  const formatTime = (iso) => {//Format timestamp to readable time
    const d = new Date(iso);
    return d.toLocaleString([], {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short"
    });
  };

  const getDateLabel = (iso) => {
    const msgDate = new Date(iso);
    const today = new Date();
    const isSameDay =
      msgDate.getDate() === today.getDate() &&
      msgDate.getMonth() === today.getMonth() &&
      msgDate.getFullYear() === today.getFullYear();

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isYesterday =
      msgDate.getDate() === yesterday.getDate() &&
      msgDate.getMonth() === yesterday.getMonth() &&
      msgDate.getFullYear() === yesterday.getFullYear();

    if (isSameDay) return "Today";
    if (isYesterday) return "Yesterday";
    return msgDate.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  };

  const connect = () => {//Establish Socket.io connection
    const s = io("http://localhost:5000", {
      query: { userId }
    });

    setSocket(s);//Save socket instance

    s.on("connect", () => {//On successful connection
      setConnected(true);
      s.emit("joinRoom", ROOM_ID);//Join group chat room
    });

    // Receive complete user list when connecting
    s.on("users:sync", (allUsers) => {
      setUsers(allUsers || {});
    });

    // When another user comes online
    s.on("user:online", ({ userId: onlineUserId, status }) => {
      setUsers((prev) => ({ ...prev, [onlineUserId]: status }));
    });

    // When a user goes offline
    s.on("user:offline", ({ userId: offlineUserId }) => {
      setUsers((prev) => {
        const updated = { ...prev };
        delete updated[offlineUserId];
        return updated;
      });
    });

    s.on("previousMessages", (msgs) => {//Load previous group chat messages
      const normalized = msgs.map((m) => ({//Normalize message structure
        ...m,
        timestamp: m.timestamp || m.createdAt || new Date().toISOString(),
        reactions: m.reactions || {}
      }));
      setMessages(normalized);
    });

    s.on("message", (msg) => {//New group chat message
      setMessages((prev) => [...prev, { ...msg, reactions: msg.reactions || {} }]);
    });

    s.on("typing", ({ userId }) => setTypingUser(userId));//Typing indicator
    s.on("stopTyping", () => setTypingUser(null));

    // Reaction updates
    s.on("updateReaction", ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId || m._id === messageId ? { ...m, reactions } : m))
      );
    });

    // Load previous DMs when requested
    s.on("previousDMs", ({ otherUserId, messages: history }) => {
      console.log(`Received ${history.length} DM messages for ${otherUserId}`);
      setDmMessages((prev) => ({
        ...prev,
        [otherUserId]: history
      }));
    });

    // DM events - NEW messages
    s.on("dmMessage", ({ fromUserId, toUserId, text, timestamp, id, reactions }) => {
      const otherUserId = fromUserId === userId ? toUserId : fromUserId;
      
      setDmMessages((prev) => ({
        ...prev,
        [otherUserId]: [
          ...(prev[otherUserId] || []),
          { 
            id, 
            fromUserId, 
            toUserId, 
            text, 
            timestamp,
            reactions: reactions || {}
          }
        ]
      }));
    });

    s.on("dmTyping", ({ fromUserId }) => {
      setDmTyping((prev) => ({ ...prev, [fromUserId]: true }));
      setTimeout(() => {
        setDmTyping((prev) => ({ ...prev, [fromUserId]: false }));
      }, 1000);
    });

    s.on("dmReactionUpdate", ({ messageId, reactions, otherUserId }) => {
      setDmMessages((prev) => ({
        ...prev,
        [otherUserId]: (prev[otherUserId] || []).map((m) =>
          m.id === messageId || m._id === messageId ? { ...m, reactions } : m
        )
      }));
    });
  };

  const sendMessage = () => {
    if (!text.trim()) return;

    if (activeChat === "room") {
      socket.emit("message", { roomId: ROOM_ID, text });
    } else {
      socket.emit("dmMessage", { toUserId: activeChat, text });
    }
    setText("");
  };

  const handleTyping = (e) => {
    setText(e.target.value);

    if (activeChat === "room") {
      socket.emit("typing", { roomId: ROOM_ID });
    } else {
      socket.emit("dmTyping", { toUserId: activeChat });
    }

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      if (activeChat === "room") {
        socket.emit("stopTyping", { roomId: ROOM_ID });
      }
    }, 800);
  };

  const handleReaction = (messageId, emoji) => {
    if (activeChat === "room") {
      socket.emit("reactMessage", { messageId, emoji });
    } else {
      socket.emit("dmReaction", { messageId, emoji, toUserId: activeChat });
    }
    setShowEmojiPicker(null);
  };

  const renderReactions = (reactions) => {
    if (!reactions || Object.keys(reactions).length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {Object.entries(reactions).map(([emoji, users]) => (
          <div
            key={emoji}
            className="bg-gray-100 rounded-full px-2 py-0.5 text-xs flex items-center gap-1"
          >
            <span>{emoji}</span>
            <span className="text-gray-600">{users.length}</span>
          </div>
        ))}
      </div>
    );
  };

  const currentMessages = activeChat === "room" ? messages : dmMessages[activeChat] || [];

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Realtime Chat</h2>
            <p className="text-gray-600">Enter your username to get started</p>
          </div>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter username"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && connect()}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
            />
            <button 
              onClick={connect}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-3 rounded-xl hover:shadow-lg transform hover:scale-105 transition-all"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-gray-800 text-lg">Chats</h3>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* Group Chat */}
          <div
            onClick={() => setActiveChat("room")}
            className={`flex items-center space-x-3 p-4 cursor-pointer transition-colors ${
              activeChat === "room" ? "bg-blue-50 border-l-4 border-blue-500" : "hover:bg-gray-50"
            }`}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Group Chat</p>
              <p className="text-xs text-gray-500">{Object.keys(users).length} members</p>
            </div>
          </div>

          {/* Direct Messages */}
          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
            Direct Messages
          </div>
          {Object.entries(users)
            .filter(([u]) => u !== userId)
            .map(([u, s]) => (
              <div
                key={u}
                onClick={() => setActiveChat(u)}
                className={`flex items-center space-x-3 p-4 cursor-pointer transition-colors ${
                  activeChat === u ? "bg-blue-50 border-l-4 border-blue-500" : "hover:bg-gray-50"
                }`}
              >
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                    {u.charAt(0).toUpperCase()}
                  </div>
                  <Circle 
                    className={`w-3 h-3 absolute bottom-0 right-0 ${
                      s === 'online' ? 'fill-green-500 text-green-500' : 'fill-gray-400 text-gray-400'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{u}</p>
                  <p className="text-xs text-gray-500">{s}</p>
                </div>
                {dmMessages[u]?.length > 0 && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {activeChat === "room" ? (
              <>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Group Chat</h3>
                  <p className="text-xs text-gray-500">{Object.keys(users).length} members online</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                  {activeChat.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{activeChat}</h3>
                  <p className="text-xs text-gray-500">
                    {users[activeChat] === "online" ? "Online" : "Offline"}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {currentMessages.map((m, i) => {
            const isMe = m.userId === userId || m.fromUserId === userId;
            const displayUserId = m.userId || m.fromUserId;
            const msgId = m.id || (m._id ? m._id.toString() : `temp-${i}`);

            const prev = currentMessages[i - 1];
            const showDate =
              !prev ||
              new Date(prev.timestamp).toDateString() !==
                new Date(m.timestamp).toDateString();

            return (
              <div key={msgId}>
                {showDate && (
                  <div className="text-center my-4">
                    <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full">
                      {getDateLabel(m.timestamp)}
                    </span>
                  </div>
                )}

                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`flex items-end space-x-2 max-w-md ${
                      isMe ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 ${
                        isMe
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                          : 'bg-gradient-to-br from-pink-500 to-orange-500'
                      }`}
                    >
                      {displayUserId.charAt(0).toUpperCase()}
                    </div>

                    <div className="relative">
                      <div
                        className={`text-xs mb-1 text-gray-500 ${
                          isMe ? 'text-right' : 'text-left'
                        }`}
                      >
                        <span className="font-semibold">{displayUserId}</span>
                        <span className="ml-2">{formatTime(m.timestamp)}</span>
                      </div>

                      <div
                        className={`rounded-2xl px-4 py-2 ${
                          isMe
                            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-br-none'
                            : 'bg-white text-gray-800 rounded-bl-none shadow-sm'
                        }`}
                      >
                        <p className="text-sm">{m.text}</p>
                      </div>

                      {/* Reactions */}
                      {renderReactions(m.reactions)}

                      {/* Emoji Picker Button */}
                      <button
                        onClick={() => setShowEmojiPicker(showEmojiPicker === msgId ? null : msgId)}
                        className={`mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 ${
                          isMe ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <Smile className="w-3 h-3" />
                      </button>

                      {/* Emoji Picker */}
                      {showEmojiPicker === msgId && (
                        <div className={`absolute ${isMe ? 'right-0' : 'left-0'} mt-1 bg-white rounded-lg shadow-lg p-2 flex gap-1 z-10`}>
                          {EMOJI_OPTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msgId, emoji)}
                              className="hover:bg-gray-100 rounded p-1 text-lg transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {activeChat === "room" && typingUser && (
            <div className="flex items-center space-x-2 text-sm text-gray-500 italic">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span>{typingUser} is typing...</span>
            </div>
          )}

          {activeChat !== "room" && dmTyping[activeChat] && (
            <div className="flex items-center space-x-2 text-sm text-gray-500 italic">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span>{activeChat} is typing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={text}
              onChange={handleTyping}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
              placeholder={activeChat === "room" ? "Message group..." : `Message ${activeChat}...`}
              className="flex-1 bg-gray-100 rounded-full px-5 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-800 placeholder-gray-500"
            />
            <button 
              onClick={sendMessage}
              className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white hover:shadow-lg transform hover:scale-110 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}