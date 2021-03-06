/* eslint-disable no-extra-boolean-cast */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable no-console */
const game = {
  ENUM: Object.freeze({
    DISPLAY_SETTING: Object.freeze({
      UNKNOWN: -1, // Unset
      DUALTOUCH_TOP: 0, // Top screen, both screens have touch
      DUALTOUCH_BOTTOM: 1, // Bottom screen, both screens have touch
      TVMONITOR: 2, // Top screen, does not have touch
      PHONE: 3, // Bottom screen that has touch but top does not
    }),
    STATE: Object.freeze({
      CONNECTION_FAILED: -1, // failed to connect to server
      CONNECTING: 0, // waiting for connection to websocket/server
      CONNECTING_SESSION_EXCHANGE: 1, // exchanging session id with ws server
      PAIR_PICK_DISPLAY: 10, // declare this screen as TOP or BOTTOM
      // 'PAIR_TO_OTHER': 11, // if TOP, give code; if BOTTOM, ask for code
      ASK_JOINHOST: 20, // buttons to either join or host the game (or randomly assign)
      HOST_GIVECODE: 21, // display code for other side to join
      ASK_JOIN_GAME: 12, // prompt for join code
      // 'PREGAME_WAIT': 30, // server init-ing stuff, give it as sec. may not even last a frame
      // 'PREGAME_TELL_PLAYER_NUM': 31, // display "you are player (1|2)"
      GAME_PLACE_SHIPS: 40, // allow the player to place their ships on the grid
      GAME_MAKE_MOVE: 41, // allow the player to select where to attack
      GAME_NOT_TURN: 42, // don't let the player do anything
      POSTGAME_WIN: 50, // display won message
      POSTGAME_LOSE: 51, // display won message
    }),
  }),
  drawInfo: {
    landscape: undefined,
    boardSize: undefined,
    offset: { x: 0, y: 0 }, // hack to get around p5 not loading until after compile
    cellSize: undefined,
    cellPadding: undefined,
    mouseWasClicked: false,
  },

  boards: {
    ships: [],
    shotsAgainst: [],
    hits: [],
    misses: [],
  },

  displaySetting: undefined,
  state: undefined,
  socket: undefined,
  session: undefined,
  playerNo: undefined,
  gameId: undefined,

  // Sets up socket connection
  init: () => {
    console.log('Init; Connecting...');
    game.displayPos = game.ENUM.DISPLAY_SETTING.UNKNOWN;
    game.state = game.ENUM.STATE.CONNECTING;

    game.socket = io();
    game.socket.on('connect', () => {
      if (game.socket.connected) {
        console.log('Connected');
        game.pair();
      } else {
        console.log('Connection failed');
      }
    });
    game.socket.on('reconnect', () => {
      if (game.socket.connected) {
        console.log('Re-connect');
        game.pair();
      } else {
        console.log('Re-connection failed');
      }
    });
  },

  pair: () => {
    if (!!game.session) {
      // If already in game, re-pair with server & carry on
      game.socket.emit('session', `${game.session}`, (ack) => {
        console.log('Session ID-ed with server');
        game.ready();
      });
    } else if (window.location.hash.length > 1) {
      // If has hash to indicate session, use it
      game.session = window.location.hash.charAt(0) === '#'
        ? window.location.hash.substr(1)
        : window.location.hash;

      console.log(`Session ID (from hash): ${game.session}`);
      game.state = game.ENUM.STATE.CONNECTING_SESSION_EXCHANGE;

      game.socket.emit('session', `${game.session}`, (ack) => {
        console.log('Session ID-ed with server');
        game.state = game.ENUM.STATE.PAIR_PICK_DISPLAY;
        game.registerEvents();
      });
    } else {
      // Otherwise get server-generated hash & use that
      fetch('/getSession')
        .then(response => response.text())
        .then((sessionid) => {
          game.session = sessionid;
          console.log(`Session ID: ${game.session}`);
          game.state = game.ENUM.STATE.CONNECTING_SESSION_EXCHANGE;

          game.socket.emit('session', `${game.session}`, (ack) => {
            console.log('Session ID-ed with server');
            game.state = game.ENUM.STATE.PAIR_PICK_DISPLAY;
            game.registerEvents();
          });
        }).catch((err) => {
          console.log(`Error getting session: ${err}`);
        });
    }
  },

  ready: () => {
    game.socket.emit('ingame', (ack) => {
      if (ack === -1) {
        game.state = game.ENUM.STATE.ASK_JOINHOST;
      } else {
        console.log(`Rejoined game '${ack}'`);
        game.gameId = ack;
        // game.state = game.ENUM.STATE['PREGAME_WAIT'];
        // TODO: This bypasses waiting for the other player; need to fix
        game.loadState();
      }
    });
  },

  loadState: () => {
    game.socket.emit('getallstates', (obj) => {
      const states = JSON.parse(obj);
      game.playerNo = states.playerNo;
      game.boards.ships = states.ships;
      game.boards.shotsAgainst = states.shotsAgainst;
      game.boards.hits = states.hits;
      game.boards.misses = states.misses;
      if (!states.state) {
        game.state = game.ENUM.STATE.HOST_GIVECODE;
      } else if (states.state === 'PLACE') {
        game.state = game.ENUM.STATE.GAME_PLACE_SHIPS;
      } else if (states.state.startsWith('MOVE.')) {
        if (
          (states.state === 'MOVE.P1' && game.playerNo === '1')
          || (states.state === 'MOVE.P2' && game.playerNo === '2')
        ) {
          game.state = game.ENUM.STATE.GAME_MAKE_MOVE;
        } else {
          game.state = game.ENUM.STATE.GAME_NOT_TURN;
        }
      } else if (states.state.startsWith('WIN.')) {
        if (
          (states.state === 'WIN.P1' && game.playerNo === '1')
          || (states.state === 'WIN.P2' && game.playerNo === '2')
        ) {
          game.state = game.ENUM.STATE.POSTGAME_WIN;
        } else {
          game.state = game.ENUM.STATE.POSTGAME_LOSE;
        }
      } else {
        console.err(`Unknown state: ${states.state}`);
      }
    });
  },

  registerEvents: () => {
    game.socket.on('pairJoined', () => {
      console.log('(Debug) Pair Joined');
    });
    game.socket.on('gameJoinAssert', (gameId) => {
      game.gameId = gameId;
    });
    game.socket.on('otherPlayerJoined', () => {
      console.log('Other Player Joined');
      // game.state = game.ENUM.STATE['PREGAME_WAIT'];
      game.state = game.ENUM.STATE.GAME_PLACE_SHIPS;
    });
    game.socket.on('bothPlayersReady', (pNo) => {
      console.log(`Game Starting You are Player ${pNo}`);
      game.playerNo = pNo;
      if (pNo === '1') {
        game.state = game.ENUM.STATE.GAME_MAKE_MOVE;
      } else {
        game.state = game.ENUM.STATE.GAME_NOT_TURN;
      }
    });

    // Game board updating
    game.socket.on('shipsPlaced', (obj) => {
      const objson = JSON.parse(obj);
      game.boards.ships = objson.ships;
    });
    game.socket.on('hit', (cell) => {
      if (!game.boards.hits.includes(cell)) {
        game.boards.hits.push(cell);
        game.state = game.ENUM.STATE.GAME_NOT_TURN;
      }
    });
    game.socket.on('miss', (cell) => {
      if (!game.boards.misses.includes(cell)) {
        game.boards.misses.push(cell);
        game.state = game.ENUM.STATE.GAME_NOT_TURN;
      }
    });
    game.socket.on('shotAgainst', (cell) => {
      if (!game.boards.shotsAgainst.includes(cell)) {
        game.boards.shotsAgainst.push(cell);
        game.state = game.ENUM.STATE.GAME_MAKE_MOVE;
      }
    });
    game.socket.on('win', (pNo) => {
      if (pNo === game.playerNo) {
        game.state = game.ENUM.STATE.POSTGAME_WIN;
      } else {
        game.state = game.ENUM.STATE.POSTGAME_LOSE;
      }
    });
  },
};

// Sets up canvas info
const redrawBase = () => {
  resizeCanvas(windowWidth, windowHeight, false);

  game.drawInfo.landscape = windowWidth > windowHeight;
  game.drawInfo.boardSize = Math.min(windowWidth, windowHeight);
  const topOrLeftMargin = (Math.max(windowWidth, windowHeight) - game.drawInfo.boardSize) / 2.0;
  if (game.drawInfo.landscape) {
    game.drawInfo.offset = createVector(topOrLeftMargin, 0);
  } else {
    game.drawInfo.offset = createVector(0, topOrLeftMargin);
  }

  // 10 rows/cols + header row/col + padding*2
  game.drawInfo.cellSize = game.drawInfo.boardSize / 11.1;

  // use 5% of cellSize as padding on each side after unsetting board padding
  game.drawInfo.cellPadding = (game.drawInfo.cellSize * 11.1 / 11.0) * 0.05;

  loop();
};

// Processing's init function; calls game init
function preload() {
  console.log('Loaded');
  game.init();
}

// Creates canvas & does initial draw
function setup() {
  console.log('Setting up');

  const canvas = createCanvas(1, 1);
  canvas.parent('canvasWrapper');
  colorMode(HSB, 360, 100, 100);
  strokeWeight(0);
  frameRate(30);

  noLoop();
  redrawBase();
}

// Event listener
function windowResized() {
  redrawBase();
}

// Event listener
function mouseClicked() {
  game.drawInfo.mouseWasClicked = true;
}

// Sets up settings for what to draw for the user
const configureDiplay = (setting) => {
  console.log(`Display is of type ${setting}`);
  game.displaySetting = setting;
  // TODO: notify server
  game.ready();
};

// Helper function for checking click position relative to button
const inBounds = (x, y, x1, y1, x2, y2) => (x >= x1) && (x <= x2) && (y >= y1) && (y <= y2);

// Generic button class
const Buttons = (buttons) => {
  const { mouseWasClicked } = game.drawInfo;
  const mouseXLocal = mouseX - game.drawInfo.offset.x;
  const mouseYLocal = mouseY - game.drawInfo.offset.y;
  buttons.forEach((opt) => {
    push();
    rectMode(CORNERS);
    if (inBounds(mouseXLocal, mouseYLocal, opt.x1, opt.y1, opt.x2, opt.y2)) {
      fill(240, 60, 50);
      if (mouseWasClicked) {
        opt.action();
      }
    } else {
      fill(240, 50, 70);
    }
    rect(opt.x1, opt.y1, opt.x2, opt.y2);

    rectMode(CORNER);
    fill(0, 0, 100);
    textAlign(CENTER, CENTER);
    textSize(game.drawInfo.cellSize / 2.0);
    text(opt.text,
      (opt.x1 + game.drawInfo.cellPadding),
      (opt.y1 + game.drawInfo.cellPadding),
      (opt.x2 - opt.x1),
      (opt.y2 - opt.y1));

    pop();
  });
};

// Draws top-left cell, which is currently used for submitting data
const drawSubmitCell = () => {
  const mouseXLocal = mouseX - game.drawInfo.offset.x;
  const mouseYLocal = mouseY - game.drawInfo.offset.y;
  const isMouseHovering = inBounds(
    mouseXLocal,
    mouseYLocal,
    0,
    0,
    game.drawInfo.cellSize,
    game.drawInfo.cellSize,
  );
  const { mouseWasClicked } = game.drawInfo;

  if (game.state === game.ENUM.STATE.POSTGAME_WIN) {
    fill(120, 50, 60);
    textAlign(CENTER, CENTER);
    textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
    text('W', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
  } else if (game.state === game.ENUM.STATE.POSTGAME_LOSE) {
    fill(0, 60, 50);
    textAlign(CENTER, CENTER);
    textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
    text('L', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
  } else if (
    game.displaySetting === game.ENUM.DISPLAY_SETTING.DUALTOUCH_BOTTOM
    || game.displaySetting === game.ENUM.DISPLAY_SETTING.PHONE
  ) {
    if (game.state === game.ENUM.STATE.GAME_PLACE_SHIPS) {
      if (isMouseHovering) {
        fill(120, 40, 80);
      } else {
        fill(120, 50, 60);
      }

      rectMode(CORNERS);
      rect(
        ((game.drawInfo.cellSize / 2.0) - game.drawInfo.cellPadding),
        game.drawInfo.cellPadding,
        ((game.drawInfo.cellSize / 2.0) + game.drawInfo.cellPadding),
        (game.drawInfo.cellSize - game.drawInfo.cellPadding),
      );
      rect(
        game.drawInfo.cellPadding,
        ((game.drawInfo.cellSize / 2.0) - game.drawInfo.cellPadding),
        (game.drawInfo.cellSize - game.drawInfo.cellPadding),
        ((game.drawInfo.cellSize / 2.0) + game.drawInfo.cellPadding),
      );

      if (isMouseHovering && mouseWasClicked) {
        game.socket.emit('placeships', JSON.stringify({ ships: game.boards.ships }), (err) => {
          if (err === -1) {
            console.log('Could not place ships');
          }
        });
      }
    }
  } else if (
    game.displaySetting === game.ENUM.DISPLAY_SETTING.DUALTOUCH_TOP
    || game.displaySetting === game.ENUM.DISPLAY_SETTING.TVMONITOR
  ) {
    if (game.state === game.ENUM.STATE.GAME_NOT_TURN) {
      fill(240, 40, 30);
      textAlign(CENTER, CENTER);
      textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
      text('x', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
    }
  }
};

// Draws row and column label cells
const drawHeaderCell = (char) => {
  // asserted to be at cell location
  fill(240, 10, 90);
  textAlign(CENTER, CENTER);
  textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
  text(char, (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
};

// Draws game board cells (most of grid)
const drawBoardCell = (row, col) => {
  const ROW_HEADERS = 'ABCDEFGHIJ';

  // asserted to be at cell location
  const mouseXLocal = mouseX - game.drawInfo.offset.x - (game.drawInfo.cellSize * (col + 1));
  const mouseYLocal = mouseY - game.drawInfo.offset.y - (game.drawInfo.cellSize * (row + 1));
  const isMouseHovering = inBounds(
    mouseXLocal,
    mouseYLocal,
    0,
    0,
    game.drawInfo.cellSize,
    game.drawInfo.cellSize,
  );
  const { mouseWasClicked } = game.drawInfo;

  const cellCanonical = `${ROW_HEADERS[row]}${col}`;

  if (isMouseHovering) {
    if (game.state === game.ENUM.STATE.GAME_NOT_TURN) {
      fill(0, 40, 30);
    } else {
      fill(0, 60, 50);
    }
  } else {
    fill(240, 50, 60);
  }

  rectMode(CORNERS);
  rect(0, 0, game.drawInfo.cellSize, game.drawInfo.cellSize);

  if (isMouseHovering && game.state === game.ENUM.STATE.GAME_MAKE_MOVE) {
    fill(0, 40, 30);
  } else {
    fill(240, 40, 30);
  }
  rect(
    game.drawInfo.cellPadding,
    game.drawInfo.cellPadding,
    (game.drawInfo.cellSize - game.drawInfo.cellPadding),
    (game.drawInfo.cellSize - game.drawInfo.cellPadding),
  );

  switch (game.displaySetting) {
    // Top screen & both have touch
    case game.ENUM.DISPLAY_SETTING.DUALTOUCH_TOP:
      if (game.boards.hits.includes(cellCanonical)) {
        fill(0, 60, 50);
        textAlign(CENTER, CENTER);
        textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
        text('x', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
      } else if (game.boards.misses.includes(cellCanonical)) {
        fill(0, 40, 30);
        textAlign(CENTER, CENTER);
        textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
        text('o', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
      } else if (mouseWasClicked && isMouseHovering) {
        // cell has not been clicked yet
        if (game.state === game.ENUM.STATE.GAME_MAKE_MOVE) {
          game.socket.emit('makeshot', cellCanonical, (err) => {
            if (err === -1) {
              console.log('Error making shot');
            }
          });
        }
      }
      break;

    // Bottom screen & both have touch
    case game.ENUM.DISPLAY_SETTING.DUALTOUCH_BOTTOM:
      if (game.state === game.ENUM.STATE.GAME_PLACE_SHIPS && mouseWasClicked && isMouseHovering) {
        if (game.boards.ships.includes(cellCanonical)) {
          game.boards.ships.splice(game.boards.ships.indexOf(cellCanonical), 1);
        } else {
          game.boards.ships.push(cellCanonical);
        }
      }
      if (game.boards.ships.includes(cellCanonical)) {
        fill(0, 0, 50);
        ellipse(
          game.drawInfo.cellSize / 2,
          game.drawInfo.cellSize / 2,
          game.drawInfo.cellSize / 2,
        );
        if (game.boards.shotsAgainst.includes(cellCanonical)) {
          fill(0, 60, 50);
          textAlign(CENTER, CENTER);
          textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
          text('x', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
        }
      } else if (game.boards.shotsAgainst.includes(cellCanonical)) {
        fill(0, 40, 30);
        textAlign(CENTER, CENTER);
        textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
        text('o', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
      }
      break;

    // A screen w/o touch
    case game.ENUM.DISPLAY_SETTING.TVMONITOR:
      if (game.boards.hits.includes(cellCanonical)) {
        fill(0, 60, 50);
        textAlign(CENTER, CENTER);
        textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
        text('x', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
      } else if (game.boards.misses.includes(cellCanonical)) {
        fill(0, 40, 30);
        textAlign(CENTER, CENTER);
        textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
        text('o', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
      }
      break;

    // A screen with touch, where other does not have touch (switches based on context)
    case game.ENUM.DISPLAY_SETTING.PHONE:
      if (
        game.state === game.ENUM.STATE.GAME_PLACE_SHIPS
        && mouseWasClicked
        && isMouseHovering
      ) {
        if (game.boards.ships.includes(cellCanonical)) {
          game.boards.ships.splice(game.boards.ships.indexOf(cellCanonical), 1);
        } else {
          game.boards.ships.push(cellCanonical);
        }
      } else if (game.state === game.ENUM.STATE.GAME_MAKE_MOVE) {
        if (game.boards.hits.includes(cellCanonical)) {
          fill(0, 60, 50);
          textAlign(CENTER, CENTER);
          textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
          text('x', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
        } else if (game.boards.misses.includes(cellCanonical)) {
          fill(0, 40, 30);
          textAlign(CENTER, CENTER);
          textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
          text('o', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
        } else if (mouseWasClicked && isMouseHovering) {
          // cell has not been clicked yet
          if (game.state === game.ENUM.STATE.GAME_MAKE_MOVE) {
            game.socket.emit('makeshot', cellCanonical, (err) => {
              if (err === -1) {
                console.log('Error making shot');
              }
            });
          }
        }
      } else if (game.boards.ships.includes(cellCanonical)) {
        fill(0, 0, 50);
        ellipse(
          game.drawInfo.cellSize / 2,
          game.drawInfo.cellSize / 2,
          game.drawInfo.cellSize / 2,
        );
        if (game.boards.shotsAgainst.includes(cellCanonical)) {
          fill(0, 60, 50);
          textAlign(CENTER, CENTER);
          textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
          text('x', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
        }
      } else if (game.boards.shotsAgainst.includes(cellCanonical)) {
        fill(0, 40, 30);
        textAlign(CENTER, CENTER);
        textSize(Math.round(game.drawInfo.cellSize - (game.drawInfo.cellPadding * 2.0)));
        text('o', (game.drawInfo.cellSize / 2.0), (game.drawInfo.cellSize / 2.0));
      }
      break;

    default:
      console.err('UNKNOWN DISPlAY TYPE');
  }
};

// Main call for grid drawing
const drawBoardGrid = () => {
  const ROW_HEADERS = 'ABCDEFGHIJ';

  push();
  fill(240, 50, 70);
  rect(
    (game.drawInfo.cellSize - game.drawInfo.cellPadding),
    (game.drawInfo.cellSize - game.drawInfo.cellPadding),
    ((game.drawInfo.cellSize * 10.0) + (game.drawInfo.cellPadding * 2.0)),
    ((game.drawInfo.cellSize * 10.0) + (game.drawInfo.cellPadding * 2.0)),
  );
  pop();

  for (let r = -1; r < 10; r++) {
    for (let c = -1; c < 10; c++) {
      push();
      translate(game.drawInfo.cellSize * (c + 1), game.drawInfo.cellSize * (r + 1));
      if (r === -1 && c === -1) {
        drawSubmitCell();
      } else if (r === -1) {
        // Number (column/horizontal) headers
        drawHeaderCell(`${c}`);
      } else if (c === -1) {
        // Letter (row/vertical) headers
        drawHeaderCell(`${ROW_HEADERS.charAt(r)}`);
      } else {
        // Cell
        drawBoardCell(r, c);
      }
      pop();
    }
  }
};

// Redraw function
function draw() {
  const { mouseWasClicked } = game.drawInfo;

  background(240, 30, 10);

  translate(game.drawInfo.offset.x, game.drawInfo.offset.y);
  const mouseXLocal = mouseX - game.drawInfo.offset.x;
  const mouseYLocal = mouseY - game.drawInfo.offset.y;

  push();
  switch (game.state) {
    case game.ENUM.STATE.CONNECTING:
    case game.ENUM.STATE.CONNECTING_SESSION_EXCHANGE:
      // waiting for connection to websocket/server
      resetMatrix();
      fill(0, 0, 100);
      textAlign(LEFT, TOP);
      textSize(32);
      text('Connecting...', 8, 8);
      break;
    case game.ENUM.STATE.CONNECTION_FAILED:
      // failed to connect to server
      resetMatrix();
      fill(0, 50, 100);
      textAlign(LEFT, TOP);
      textSize(32);
      text('Connection failed', 8, 8);
      break;
    case game.ENUM.STATE.PAIR_PICK_DISPLAY:
      // declare this screen as TOP or BOTTOM
      push();

      Buttons([
        {
          text: 'Top\n(touch)',
          x1: (game.drawInfo.cellSize * 0.5),
          y1: (game.drawInfo.cellSize * 2.0),
          x2: (game.drawInfo.cellSize * 4.5),
          y2: (game.drawInfo.cellSize * 5.0),
          action: () => configureDiplay(game.ENUM.DISPLAY_SETTING.DUALTOUCH_TOP),
        },
        {
          text: 'Bottom\n(touch)',
          x1: (game.drawInfo.cellSize * 0.5),
          y1: (game.drawInfo.cellSize * 6.0),
          x2: (game.drawInfo.cellSize * 4.5),
          y2: (game.drawInfo.cellSize * 9.0),
          action: () => configureDiplay(game.ENUM.DISPLAY_SETTING.DUALTOUCH_BOTTOM),
        },
        {
          text: 'Non-touch',
          x1: (game.drawInfo.cellSize * 6.5),
          y1: (game.drawInfo.cellSize * 2.0),
          x2: (game.drawInfo.cellSize * 10.5),
          y2: (game.drawInfo.cellSize * 5.0),
          action: () => configureDiplay(game.ENUM.DISPLAY_SETTING.TVMONITOR),
        },
        {
          text: 'Touch\n(switching)',
          x1: (game.drawInfo.cellSize * 6.5),
          y1: (game.drawInfo.cellSize * 6.0),
          x2: (game.drawInfo.cellSize * 10.5),
          y2: (game.drawInfo.cellSize * 9.0),
          action: () => configureDiplay(game.ENUM.DISPLAY_SETTING.PHONE),
        },
      ]);

      stroke(240, 40, 30);
      strokeWeight(game.drawInfo.cellPadding);
      line(
        (game.drawInfo.cellSize * 5.5),
        (game.drawInfo.cellSize * 1.5),
        (game.drawInfo.cellSize * 5.5),
        (game.drawInfo.cellSize * 9.5),
      );

      pop();
      break;
    case game.ENUM.STATE.PAIR_TO_OTHER:
      // pair to another device; temp disabled
      break;
    case game.ENUM.STATE.ASK_JOINHOST:
      // ask whether to join or host a game
      push();
      Buttons([
        {
          text: 'Start new game',
          x1: (game.drawInfo.cellSize * 1.0),
          y1: (game.drawInfo.cellSize * 1.0),
          x2: (game.drawInfo.cellSize * 10.0),
          y2: (game.drawInfo.cellSize * 4.0),
          action: () => {
            game.socket.emit('newgame', (ack) => {
              console.log(`Started game '${ack}'`);
              game.gameId = ack;
              game.state = game.ENUM.STATE.HOST_GIVECODE;
            });
          },
        },
        {
          text: 'Join existing game',
          x1: (game.drawInfo.cellSize * 1.0),
          y1: (game.drawInfo.cellSize * 6.0),
          x2: (game.drawInfo.cellSize * 10.0),
          y2: (game.drawInfo.cellSize * 10.0),
          action: () => {
            // TODO: move to ASK_JOIN_GAME and without window.prompt
            // eslint-disable-next-line no-alert
            const gameId = window.prompt('Game ID to join:', '');
            game.socket.emit('joingame', `${gameId}`, (ack) => {
              if (ack === -1) {
                console.log(`Failed to join game '${gameId}'`);
              } else {
                console.log(`Joined game '${gameId}'`);
                game.gameId = ack;
                // game.state = game.ENUM.STATE['PREGAME_WAIT'];
                game.state = game.ENUM.STATE.GAME_PLACE_SHIPS;
              }
            });
          },
        },
      ]);
      pop();
      break;
    case game.ENUM.STATE.HOST_GIVECODE:
      // ask whether to join or host a game
      push();
      Buttons([
        {
          text: `Join code: ${game.gameId}`,
          x1: (game.drawInfo.cellSize * 1.0),
          y1: (game.drawInfo.cellSize * 1.0),
          x2: (game.drawInfo.cellSize * 10.0),
          y2: (game.drawInfo.cellSize * 4.0),
          action: () => {},
        },
      ]);
      pop();
      break;
    case game.ENUM.STATE.ASK_JOIN_GAME:
      break;
    /* case game.ENUM.STATE['PREGAME_WAIT']:
      resetMatrix();
      fill(0,0,100);
      textAlign(LEFT, TOP);
      textSize(32);
      text('Waiting on server...', 8, 8);
      break; */
    case game.ENUM.STATE.PREGAME_TELL_PLAYER_NUM:
      // display "you are player (1|2)"
      break;
    case game.ENUM.STATE.GAME_PLACE_SHIPS: // allow the player to place their ships on the grid
    case game.ENUM.STATE.GAME_MAKE_MOVE: // allow the player to select where to attack
    case game.ENUM.STATE.GAME_NOT_TURN: // don't let the player do anything
    case game.ENUM.STATE.POSTGAME_WIN: // tell player won
    case game.ENUM.STATE.POSTGAME_LOSE: // tell player lost
      drawBoardGrid();
      break;
    default:
      // "Oops!" screen?
      console.log(`Unknown game state: ${game.state}`);
  }
  pop();

  // reset event listener trick
  if (mouseWasClicked) game.drawInfo.mouseWasClicked = false;
}
