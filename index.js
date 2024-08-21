// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
const http = require("http");
const { WebSocketServer } = require("ws");
const uuidv4 = require("uuid").v4;
// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
const url = require("url");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running");
});
const wsServer = new WebSocketServer({ server });
const port = process.env.PORT || 8000;

const rooms = new Map();
const connections = {};
const users = {};

const joinRoom = (ws, roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);

  ws.on("close", () => {
    rooms.get(roomId).delete(ws);
    if (rooms.get(roomId).size === 0) {
      rooms.delete(roomId);
    }
  });
};

const broadcastToRoom = (roomId, message) => {
  if (rooms.has(roomId)) {
    const clients = rooms.get(roomId);
    // biome-ignore lint/complexity/noForEach: <explanation>
    clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    });
  }
};

// every time server recieves message broadcast list of users to everyone, shows whos online and their state
const broadcastState = () => {
  // biome-ignore lint/complexity/noForEach: <explanation>
  Object.keys(connections).forEach((uuid) => {
    const connection = connections[uuid];
    const message = JSON.stringify(users);
    connection.send(message);
  });
};

const handleMessage = (bytes, uuid) => {
  try {
    const message = JSON.parse(bytes.toString());
    const user = users[uuid];

    if (message.type === "setUsername") {
      users[uuid] = {
        ...user,
        username: message.username,
        pfp: message.pfp,
        nickname: message.nickname,
      };
      broadcastState();
    } else if (message.type === "chat") {
      broadcastToRoom(
        message.roomId,
        JSON.stringify({
          type: "chat",
          username: user.username,
          message: message.message,
          time: message.time,
        })
      );
    } else {
      user.pfp = message.pfp || user.pfp;
      user.nickname = message.nickname || user.nickname;
      user.state = {
        x: message.x,
        y: message.y,
        cursor: message.cursor || user.state.cursor,
        username: message.username || user.state.username,
        color: message.color || user.state.color,
      };
      broadcastState();
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }
};

const handleClose = (uuid) => {
  console.log(`${users[uuid].username} disconnected`);
  delete connections[uuid];
  delete users[uuid];
  broadcastState();
};

wsServer.on("connection", (connection, request) => {
  // ws://10.10.22.20:8000?username=Alex
  const { selectedCursor, color, username, pfp, nickname, roomId } = url.parse(
    request.url,
    true
  ).query;

  const uuid = uuidv4();
  console.log(`${username} connected`);

  connections[uuid] = connection;

  users[uuid] = {
    username,
    pfp,
    nickname,
    state: {
      x: 0,
      y: 0,
      cursor: selectedCursor || "/default.png",
      color: color || "blue",
    },
  };

  if (roomId) {
    joinRoom(connection, roomId);
  }

  connection.on("message", (message) => handleMessage(message, uuid));
  connection.on("close", () => handleClose(uuid));

  connection.send(JSON.stringify({ type: "userState", users }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Websocket server is running on port ${port}`);
});
