const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

// -------------------------------------------
// App Setup
// -------------------------------------------

const app = express();
app.use(express.static('src/www'));
app.use(bodyParser.json());
const sessionParser = session({
    secret: 'absolutely secret secret',
    saveUninitialized: false,
    unset: 'destroy',
    resave: false,
});
app.use(sessionParser);
app.use((req, res, next) => {
    if (req.path == '/login' || req.session.username) {
        next();
    } else {
        res.status(401).end();
    }
});
const server = http.createServer(app);
const wss = new WebSocket.Server({server});

// -------------------------------------------
// Helper functions
// -------------------------------------------

const formatErrorMessage = (error) => {
  return {
    error: (typeof error == 'string') ? error : error.message
  };
};

// -------------------------------------------
// Data structures
// -------------------------------------------

const channels = [];

// -------------------------------------------
// Endpoints
// -------------------------------------------

app.post('/login', async (req, res) => {
    req.session.username = req.query.username;
    res.status(200).end();
});
app.post('/logout', async (req, res) => {
    delete req.session;
    res.status(200).end();
});
app.get('/channels', async (req, res) => {
    res.send(channels.map(channel => channel.name));
});
app.post('/channel/create/:name', async (req, res) => {
    if (!channels.find(channel => channel.name == req.params.name)) {
        channels.push({
            name: req.params.name,
            messages: [],
            users: [],
            theme: "",
        });
    }
    res.status(200).end();
});
app.delete('/channel/:name', async (req, res) => {
    const channelId = channels.findIndex(channel => channel.name == req.params.name);
    const channel = channelId >= 0 ? channels[channelId] : null;
    if (channel && channel.users.length > 0) {
        res.status(400).send({message: "There are still users in the channel!"});
        return;
    }
    if (channel) {
        channels.splice(channelId, 1);
    }
});

// -------------------------------------------
// Websocket connections
// -------------------------------------------

wss.on('connection', (ws, req) => {
    sessionParser(req, {}, () => {
        if (!req.session.username) {
            ws.terminate();
            return;
        }
        const match = req.url.match(/channel\/(.*)/);
        if (!match || !match[1]) {
            ws.terminate();
            return;
        }
        const name = match[1];
        const channel = channels.find(c => c.name == name);
        if (!channel) {
            ws.terminate();
            return;
        }
        channel.users.push(ws);
        ws.send(JSON.stringify(channel.messages));
        ws.on('close', () => {
            const idx = channel.users.findIndex(o => o == ws);
            if (idx >= 0) {
                channel.users.splice(idx, 1);
            }
        });
        ws.on('error', () => {
            const idx = channel.users.findIndex(o => 0 == ws);
            if (idx >= 0) {
                channel.users.splice(idx, 1);
            }
        });
        ws.on('message', (msg) => {
            var message = {};
            try {
                message = JSON.parse(msg);
            } catch(err) {
                return;
            }
            // TODO: if message is control message, do something
            message.sender = req.session.username;
            message.date = new Date();
            channel.messages.push(message);
            while (channel.messages.length > 100) {
                channel.messages.unshift();
            }
            for (const socket of channel.users) {
                socket.send(JSON.stringify(message));
            }
        });
    });
});

// -------------------------------------------
// Server startup
// -------------------------------------------

server.listen(5000, () => {
    console.log(`Chat is running on port ${server.address().port}...`);
});