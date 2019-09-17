/* eslint-disable no-console */
const express = require('express');
const path = require('path');
// const url = require('url');
const app = express(); // creates an express instance
const http = require('http').Server(app); // sets up express as server
const session = require('express-session');
const RedisStore = require('connect-redis')(session); // creates store for session
const io = require('socket.io')(http); // binds socket server to incoming connections (shared socket w/ web server)
const redisAdapter = require('socket.io-redis');
const redis = require('redis');

// Imports in codebase
const socketServer = require('./socket');

// Environment vars
const port = process.env.PORT || process.env.NODE_PORT || 3000;
const redisURL = process.env.REDISCLOUD_URL || process.env.REDIS_URL || 'redis://localhost:6379';

// const redisURLParsed = url.parse(redisURL);
// const redisHost = redisURLParsed.hostname;
// const redisPort = redisURLParsed.port;
// const redisPass = (redisURLParsed.auth ? redisURLParsed.auth.split(':')[1] : undefined);

// Set up Redis for socker server
const redisClient = redis.createClient(redisURL);

redisClient.on('error', (err) => {
  console.log(`Redis Error: ${err}`);
});

// Web server settings (sessioning)
app.set('trust proxy', 2); // required to let cookies work
app.use(session({
  key: 'sessionid',
  store: new RedisStore({
    url: redisURL,
  }),
  secret: 'ctmartin-Battleship',
  resave: true,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: true,
  },
}));

// Session management endpoints
app.get('/newSession', (req, res) => {
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).send(`Error regenerating session: ${err}`);
    } else {
      res.status(200).send(req.session.id);
    }
  });
});
app.get('/getSession', (req, res) => {
  res.send(`${req.session.id}`);
});

// Otherwise, send static front-end files
app.use(express.static(path.resolve(`${__dirname}/../client`)));

// Start socket server
io.adapter(redisAdapter(redisURL));
socketServer(io, redisClient);

// Start web server
http.listen(port, () => console.log(`Listening on port ${port}`));
