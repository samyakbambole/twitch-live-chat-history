'use strict';
const twitchChannelsArgs = process.argv.slice(2);
const chalk = require('chalk');
const tmi = require('tmi.js');
const Datastore = require('nedb');
const morgan = require('morgan'); 
const consola = require('consola'); 
const path = require('path');

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const { findIcon } = require('./helpers');
const emoticons = require('./data/twitch-emoticons');

app.use(express.static(path.join(__dirname, 'web')));
app.use(morgan('tiny')); 
app.set('views', path.join(__dirname, 'web'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

app.use('/', (req, res) => {
  res.render('index.html');
});

let twitchChannels = [];

// load databases
const database = new Datastore('chats.db');
const dropsDb = new Datastore('drops.db');
database.loadDatabase();
dropsDb.loadDatabase();

// instanciate client to listen twitch channel
const client = new tmi.Client({
  connection: {
    secure: true,
    reconnect: true,
  },
  channels: twitchChannelsArgs,
});

// prevent duplicate message
let isClientConnected = false;

// Clears Console
function clearConsoleAndScrollbackBuffer() {
  process.stdout.write('\u001b[3J\u001b[2J\u001b[1J');
  console.clear();
}

function isInArray(value, array) {
  return array.indexOf(value) > -1;
}

consola.success(chalk.greenBright('Fetching messages...'));
let fetched = false;

if (twitchChannelsArgs.length === 0) {
  consola.info('No Channels added, go to http://localhost:8080 to add or remove channels'); 
}

// listen messages from twitch channels
client.on('message', (channel, tags, message, self) => {
  // "#twitchChannel | Alca: Hello, World!"
  if (!fetched) {
    clearConsoleAndScrollbackBuffer();
    console.info('---------------' + 'Twitch Live Chat' + '---------------');
    fetched = true;
  }
  console.log(chalk.cyanBright(`${channel} | ${tags['display-name']} > ${message}`));

  // database.insert({socket_id: socket.id, time: socket.handshake.time});
  database.insert({
    channel,
    message,
    username: tags['display-name'],
  });

  if (message === '!drop me') {
    console.log(`${tags['display-name']} just dropped!`);
    dropsDb.insert({
      channel,
      username: tags['display-name'],
    });
  }
});

io.on('connection', (socket) => {
  // connect client
  if(!isClientConnected) {
    client.connect();
    isClientConnected = true;
  }

  if (twitchChannelsArgs.length > 0) {
    twitchChannelsArgs.forEach((newChannel) => {
      if(!isInArray(newChannel,twitchChannels)){
        twitchChannels.push(newChannel);
      }
    });
  }

  socket.emit('channels', twitchChannels);

  client.on('message', (channel, tags, message, self) => {
    if (self) return;
    socket.emit('chat', { channel, tags, message: findIcon(message, emoticons) });
  });

  socket.on('addChat', (newChannel) => {
    if(!isInArray(newChannel,twitchChannels)){
      twitchChannels.push(newChannel);
      client.join(newChannel);
      socket.emit('channels', twitchChannels);
    }
  });

  socket.on('disconnectChannel', (channelToDisconnect) => {
    twitchChannels = twitchChannels.filter((channel) => channel !== channelToDisconnect);
    // No need to disconnect channel be cause it will impact other user.
    //client.part(channelToDisconnect.replace('#', ''));
  });
});

server.listen(8080);
