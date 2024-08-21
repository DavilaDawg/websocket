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

/**
 * @type{Websocket[]}
 */
const connections = {};
const users = {};

// every time server recieves message broadcast list of users to everyone, shows whos online and their state
const broadcastState = () => {
  // biome-ignore lint/complexity/noForEach: <explanation>
  Object.keys(connections).forEach((uuid) => {
    const connection = connections[uuid];
    const message = JSON.stringify(users);
    connection.send(message);
  });
};

const broadcastToAll = (message) => {
  const messageString = JSON.stringify(message);
  // biome-ignore lint/complexity/noForEach: <explanation>
  Object.values(connections).forEach((connection) => {
    connection.send(messageString);
  });
};

const broadcastToRoom = (roomId, message) => {
  console.log("broadcasting to room")
  const messageString = JSON.stringify(message)

  console.log("message: ", messageString)

  Object.values(connections).forEach((connection, uuid)=> { 
    if (users[uuid].room === roomId) {
      connection.send(messageString);
    }
  })
};

const handleMessage = (bytes, uuid, spaceId) => {
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
      console.log("about to broadcast")
      broadcastToRoom(spaceId, {
        type: "chat",
        username: user.username,
        message: message.message,
        time: message.time,
      });
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
  const { selectedCursor, color, username, pfp, nickname, spaceId } = url.parse(
    request.url,
    true
  ).query;
  // Generate a UUID for the user and its websocket connection
  const uuid = uuidv4();
  console.log(`${username} connected`);

  // Add users websocket connection to the connections array
  connections[uuid] = connection;
  console.log("spaceId: ", spaceId)
  // Create the corresponding user
  users[uuid] = {
    room: spaceId,
    username,
    pfp, // pfp: Profile Picture
    nickname,
    state: {
      // Holds the state of the users cursor
      x: 0,
      y: 0,
      cursor: selectedCursor || "/default.png",
      color: color || "blue",
    },
  };

  connection.on("message", (message) => handleMessage(message, uuid, spaceId));
  connection.on("close", () => handleClose(uuid));

  connection.send(JSON.stringify({ type: "userState", users }));

  broadcastToAll({
    type: "join",
    username: username,
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Websocket server is running on port ${port}`);
});
