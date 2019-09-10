/* eslint-disable no-console */
module.exports = (io, redisClient) => {
  io.on('connection', (socket) => {
    const data = {
      session: undefined,
    };
    console.log('User: Connect');
    socket.on('disconnect', () => {
      console.log('User: Disconnect');
      redisClient.del(`sessionOf.${socket.id}`);
      redisClient.lrem(`socketsOf.${data.session}`, 1, socket.id);
    });
    socket.on('session', (sessionid, cb) => {
      data.session = sessionid;
      redisClient.set(`sessionOf.${socket.id}`, sessionid);
      redisClient.lpush(`socketsOf.${sessionid}`, socket.id);
      console.log(`Session mapped: '${socket.id}'=>'${sessionid}'`);
      redisClient.lrange(`socketsOf.${sessionid}`, 0, -1, (err, reply) => {
        if (reply.length > 1) {
          reply.forEach((s) => {
            io.to(s).emit('pairJoined');
          });
        }
      });
      socket.on('ingame', cb2 => redisClient.exists(`gameOf.${sessionid}`, (err, inGame) => {
        if (inGame === 1) {
          return redisClient.get(`gameOf.${sessionid}`, (err2, gameId) => {
            console.log(`'${data.session}' has rejoined game '${gameId}'`);
            return cb2(gameId);
          });
        }
        return cb2(-1);
      }));
      socket.on('newgame', (cb2) => {
        redisClient.incr('gameNum', (err, gameId) => {
          console.log(`'${data.session}' has started game '${gameId}'`);
          redisClient.set(`gameOf.${sessionid}`, gameId);
          redisClient.set(`games.${gameId}.player1`, sessionid);
          return cb2(gameId);
        });
      });
      socket.on('joingame', (gameId, cb2) => {
        if (gameId === 'undefined') {
          console.log(`'${data.session}' tried to join with invalid game id`);
          return cb(-1);
        }
        return redisClient.get('gameNum', (err, gameNum) => {
          if (gameId > gameNum) {
            console.log(`'${data.session}' failed to join game '${gameId}': game does not exist`);
            return cb2(-1);
          }
          return redisClient.exists(`games.${gameId}.player2`, (err2, pExists) => {
            if (pExists === 0) {
              redisClient.set(`gameOf.${sessionid}`, gameId);
              redisClient.set(`games.${gameId}.player2`, sessionid);
              console.log(`'${data.session}' has joined game '${gameId}'`);

              redisClient.get(`games.${gameId}.player1`, (err3, p1Sess) => {
                console.log(`-> Notifying other player '${p1Sess}'`);
                redisClient.lrange(`socketsOf.${p1Sess}`, 0, -1, (err4, reply) => {
                  if (reply.length > 1) {
                    reply.forEach((s) => {
                      io.to(s).emit('otherPlayerJoined');
                    });
                  } else {
                    console.log(`No sockets found for '${p1Sess}'`);
                  }
                });
              });

              redisClient.set(`gameState.${gameId}`, 'PLACE');

              return cb2(1);
            }
            console.log(`'${data.session}' failed to join game '${gameId}': player 2 already exists`);
            return cb2(-1);
          });
        });
      });
      socket.on('placeships', (obj, cb2) => redisClient.get(`gameOf.${sessionid}`, (err2, gameId) => {
        if (err2) {
          return cb2(-1);
        }
        return redisClient.get(`gameState.${gameId}`, (err3, gameState) => {
          if (err3 || gameState !== 'PLACE') {
            return cb2(-1);
          }
          let objson;
          try {
            objson = JSON.parse(obj);
          } catch (error) {
            console.log(`Could not place ships of ${sessionid}: ${error}`);
            return cb2(-1);
          }
          if (objson.ships.length === 17) {
            objson.ships.forEach((cell) => {
              if (cell.length !== 2
                            || cell[0] < 'A'
                            || cell[0] > 'J'
                            || cell[1] < '0'
                            || cell[1] > '9'
              ) {
                console.log(`Could not place ships of ${sessionid}: Invalid positioning`);
                return cb2(-1);
              }
              return redisClient.rpush(`shipsOf.${sessionid}`, cell);
            });

            return redisClient.get(`games.${gameId}.player1`, (err4, p1Sess) => {
              if (sessionid === p1Sess) {
                redisClient.lrange(`socketsOf.${sessionid}`, 0, -1, (err5, reply) => {
                  if (reply.length > 1) {
                    reply.forEach((s) => {
                      io.to(s).emit('shipsPlaced', obj);
                    });
                  } else {
                    console.log(`No sockets found for '${p1Sess}'`);
                  }
                });
              }
              return redisClient.get(`games.${gameId}.player2`, (err5, p2Sess) => {
                if (sessionid === p2Sess) {
                  redisClient.lrange(`socketsOf.${sessionid}`, 0, -1, (err6, reply) => {
                    if (reply.length > 1) {
                      reply.forEach((s) => {
                        io.to(s).emit('shipsPlaced', obj);
                      });
                    } else {
                      console.log(`No sockets found for '${p1Sess}'`);
                    }
                  });
                }
                return redisClient.exists(`shipsOf.${p1Sess}`, (err6, p1ready) => redisClient.exists(`shipsOf.${p2Sess}`, (err7, p2ready) => {
                  if (p1ready === 1 && p2ready === 1) {
                    console.log('Both players ready, notifying');
                    redisClient.set(`gameState.${gameId}`, 'MOVE.P1');
                    redisClient.lrange(`socketsOf.${p1Sess}`, 0, -1, (err8, reply) => {
                      if (reply.length > 1) {
                        reply.forEach((s) => {
                          io.to(s).emit('bothPlayersReady', '1');
                        });
                      } else {
                        console.log(`No sockets found for '${p1Sess}'`);
                      }
                    });
                    redisClient.lrange(`socketsOf.${p2Sess}`, 0, -1, (err8, reply) => {
                      if (reply.length > 1) {
                        reply.forEach((s) => {
                          io.to(s).emit('bothPlayersReady', '2');
                        });
                      } else {
                        console.log(`No sockets found for '${p2Sess}'`);
                      }
                    });
                  }
                  return cb2(1);
                }));
              });
            });
          }
          console.log(`Could not place ships of ${sessionid}: Number check failed; ${objson.ships.length}!=17`);
          return cb2(-1);
        });
      }));
      socket.on('makeshot', (cell, cb2) => redisClient.get(`gameOf.${sessionid}`, (err2, gameId) => {
        if (err2) {
          console.log('MakeShot: Err getting game');
          return cb2(-1);
        }
        return redisClient.get(`gameState.${gameId}`, (err3, gameState) => redisClient.get(`games.${gameId}.player1`, (err4, p1Sess) => redisClient.get(`games.${gameId}.player2`, (err4b, p2Sess) => {
          if (err3 || err4 || err4b) {
            console.log('MakeSho: Err getting game players');
            return cb2(-1);
          }
          if (gameState === 'MOVE.P1') {
            if (sessionid === p1Sess) {
              if (cell.length !== 2
                                || cell[0] < 'A'
                                || cell[0] > 'J'
                                || cell[1] < '0'
                                || cell[1] > '9'
              ) {
                console.log(`MakeShot: Invalid cell ${cell}`);
                return cb2(-1);
              }
              return redisClient.lindex(`shotsOf.${sessionid}`, cell, (err5, reply0) => {
                if (Number.isInteger(reply0)) {
                  console.log('MakeShot: Player already made this shot');
                  return cb2(-1);
                }
                redisClient.rpush(`shotsOf.${sessionid}`, cell);
                redisClient.set(`gameState.${gameId}`, 'MOVE.P2');
                console.log(`P1 MOVE: ${cell}`);
                redisClient.lrange(`shipsOf.${p2Sess}`, 0, -1, (err6, reply1) => {
                  if (reply1.includes(cell)) {
                    redisClient.lrange(`socketsOf.${p1Sess}`, 0, -1, (err8, reply) => {
                      if (reply.length > 1) {
                        reply.forEach((s) => {
                          io.to(s).emit('hit', cell);
                        });
                      } else {
                        console.log(`No sockets found for '${p1Sess}'`);
                      }
                    });

                    redisClient.lrange(`shotsOf.${sessionid}`, 0, -1, (err9, reply2) => {
                      if (reply2.filter(c => reply1.includes(c)).length === 17) {
                        redisClient.set(`gameState.${gameId}`, 'WIN.P1');
                        redisClient.lrange(`socketsOf.${p1Sess}`, 0, -1, (err10, reply3) => {
                          if (reply3.length > 1) {
                            reply3.forEach((s) => {
                              io.to(s).emit('win', '1');
                            });
                          } else {
                            console.log(`No sockets found for '${p1Sess}'`);
                          }
                        });
                        redisClient.lrange(`socketsOf.${p2Sess}`, 0, -1, (err10, reply3) => {
                          if (reply3.length > 1) {
                            reply3.forEach((s) => {
                              io.to(s).emit('win', '1');
                            });
                          } else {
                            console.log(`No sockets found for '${p2Sess}'`);
                          }
                        });
                      }
                    });
                  } else {
                    redisClient.lrange(`socketsOf.${p1Sess}`, 0, -1, (err8, reply) => {
                      if (reply.length > 1) {
                        reply.forEach((s) => {
                          io.to(s).emit('miss', cell);
                        });
                      } else {
                        console.log(`No sockets found for '${p1Sess}'`);
                      }
                    });
                  }
                });
                redisClient.lrange(`socketsOf.${p2Sess}`, 0, -1, (err8, reply) => {
                  if (reply.length > 1) {
                    reply.forEach((s) => {
                      io.to(s).emit('shotAgainst', cell);
                    });
                  } else {
                    console.log(`No sockets found for '${p2Sess}'`);
                  }
                });
                return cb2(1);
              });
            }
            console.log('MakeShot: Err: P2 made shot out of turn');
            return cb2(-1);
          } if (gameState === 'MOVE.P2') {
            if (sessionid === p2Sess) {
              if (cell.length !== 2
                                || cell[0] < 'A'
                                || cell[0] > 'J'
                                || cell[1] < '0'
                                || cell[1] > '9'
              ) {
                console.log(`MakeShot: Err: Invalid cell ${cell}`);
                return cb2(-1);
              }
              return redisClient.lindex(`shotsOf.${sessionid}`, cell, (err5, reply0) => {
                if (Number.isInteger(reply0)) {
                  console.log('MakeShot: Player already made shot');
                  return cb2(-1);
                }
                redisClient.rpush(`shotsOf.${sessionid}`, cell);
                redisClient.set(`gameState.${gameId}`, 'MOVE.P1');
                console.log(`P2 MOVE: ${cell}`);
                redisClient.lrange(`shipsOf.${p1Sess}`, 0, -1, (err6, reply1) => {
                  if (reply1.includes(cell)) {
                    redisClient.lrange(`socketsOf.${p2Sess}`, 0, -1, (err8, reply) => {
                      if (reply.length > 1) {
                        reply.forEach((s) => {
                          io.to(s).emit('hit', cell);
                        });
                      } else {
                        console.log(`No sockets found for '${p2Sess}'`);
                      }
                    });

                    redisClient.lrange(`shotsOf.${sessionid}`, 0, -1, (err9, reply2) => {
                      if (reply2.filter(c => reply1.includes(c)).length === 17) {
                        redisClient.set(`gameState.${gameId}`, 'WIN.P2');
                        redisClient.lrange(`socketsOf.${p1Sess}`, 0, -1, (err10, reply3) => {
                          if (reply3.length > 1) {
                            reply3.forEach((s) => {
                              io.to(s).emit('win', '2');
                            });
                          } else {
                            console.log(`No sockets found for '${p1Sess}'`);
                          }
                        });
                        redisClient.lrange(`socketsOf.${p2Sess}`, 0, -1, (err10, reply3) => {
                          if (reply3.length > 1) {
                            reply3.forEach((s) => {
                              io.to(s).emit('win', '2');
                            });
                          } else {
                            console.log(`No sockets found for '${p1Sess}'`);
                          }
                        });
                      }
                    });
                  } else {
                    redisClient.lrange(`socketsOf.${p2Sess}`, 0, -1, (err8, reply) => {
                      if (reply.length > 1) {
                        reply.forEach((s) => {
                          io.to(s).emit('miss', cell);
                        });
                      } else {
                        console.log(`No sockets found for '${p2Sess}'`);
                      }
                    });
                  }
                });
                redisClient.lrange(`socketsOf.${p1Sess}`, 0, -1, (err8, reply) => {
                  if (reply.length > 1) {
                    reply.forEach((s) => {
                      io.to(s).emit('shotAgainst', cell);
                    });
                  } else {
                    console.log(`No sockets found for '${p1Sess}'`);
                  }
                });
                return cb2(1);
              });
            }
            console.log('MakeShot: Err: P1 made shot out of turn');
            return cb2(-1);
          }
          console.log('MakeShot: Err: Unknown state, or player not in game');
          return cb2(-1);
        })));
      }));
      socket.on('getallstates', (cb2) => {
        const states = {
          playerNo: '',
          state: '',
          ships: [],
          shotsAgainst: [],
          hits: [],
          misses: [],
        };
        return redisClient.get(`gameOf.${sessionid}`, (err2, gameId) => redisClient.get(`gameState.${gameId}`, (err3, gameState) => redisClient.get(`games.${gameId}.player1`, (err4, p1Sess) => redisClient.get(`games.${gameId}.player2`, (err4b, p2Sess) => redisClient.lrange(`shipsOf.${p1Sess}`, 0, -1, (err5, p1ships) => redisClient.lrange(`shipsOf.${p2Sess}`, 0, -1, (err6, p2ships) => redisClient.lrange(`shotsOf.${p1Sess}`, 0, -1, (err7, p1shots) => redisClient.lrange(`shotsOf.${p2Sess}`, 0, -1, (err8, p2shots) => {
          states.state = gameState;
          if (sessionid === p1Sess) {
            states.playerNo = '1';
            states.ships = p1ships || [];
            states.shotsAgainst = p2shots || [];
            states.hits = p1shots == null || p2ships == null ? []
              : p1shots.filter(cell => p2ships.includes(cell));
            states.misses = p1shots == null || p2ships == null ? []
              : p1shots.filter(cell => !p2ships.includes(cell));
            return cb2(JSON.stringify(states));
          } // player is p2
          states.playerNo = '2';
          states.ships = p2ships || [];
          states.shotsAgainst = p1shots || [];
          states.hits = p2shots == null || p1ships == null ? []
            : p2shots.filter(cell => p1ships.includes(cell));
          states.misses = p2shots == null || p1ships == null ? []
            : p2shots.filter(cell => !p1ships.includes(cell));
          return cb2(JSON.stringify(states));
        }))))))));
      });
      // RETURN .on('session')
      return cb('ACK');
    }); // END .on('session')
  }); // END .on('connection')

  // game.init(io);
};
