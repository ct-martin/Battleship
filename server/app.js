/* eslint-disable no-console */
import * as socket from './socket';

const express = require('express');
const path = require('path');
// const url = require('url');

const app = express();
const http = require('http').Server(app);
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const io = require('socket.io')(http);
const redisAdapter = require('socket.io-redis');
const redis = require('redis');

const port = process.env.PORT || process.env.NODE_PORT || 3000;
const redisURL = process.env.REDISCLOUD_URL || process.env.REDIS_URL || 'redis://localhost:6379';

// const redisURLParsed = url.parse(redisURL);
// const redisHost = redisURLParsed.hostname;
// const redisPort = redisURLParsed.port;
// const redisPass = (redisURLParsed.auth ? redisURLParsed.auth.split(':')[1] : undefined);

const redisClient = redis.createClient(redisURL);

redisClient.on('error', (err) => {
  console.log(`Redis Error: ${err}`);
});

app.set('trust proxy', 2);
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

app.use(express.static(path.resolve(`${__dirname}/../client`)));

io.adapter(redisAdapter(redisURL));
socket(io, redisClient);

http.listen(port, () => console.log(`Listening on port ${port}`));
