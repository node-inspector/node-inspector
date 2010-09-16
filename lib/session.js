var http = require('http'),
    events = require('events'),
    path = require('path'),
    debugr = require('./debugger');

///////////////////////////////////////////////////////////
// exports

exports.createSession = function () {
  var debug = null,
      clients = [],
      breakpoints = {},
      pending = {},
      direct = ['scripts',
                'scope',
                'lookup',
                'evaluate',
                'backtrace',
                'logLines',
                'profile',
                'listbreakpoints'],
      session;
  
  function isBpCommand(cmd) {
    return ['setbreakpoint','clearbreakpoint','changebreakpoint'].indexOf(cmd) > -1;
  }
  
  function breakpointReturnFilter(msg) {
    if (isBpCommand(msg.command)) {
      msg.arguments = breakpoints[msg.request_seq];
      delete breakpoints[msg.request_seq];
    }
    return msg;
  }
  
  function breakpointRequestFilter(msg) {
    if (isBpCommand(msg.command)) {
      breakpoints[msg.seq] = msg.arguments;
    }
    return msg;
  }

  function getConnection(msg) {
    var conn = pending[msg.request_seq];
    delete pending[msg.request_seq];
    return conn;
  }

  session = Object.create(events.EventEmitter.prototype, {
    close: {
      value: function ()
      {
        if (debug && debug.connected) {
          debug.close();
        }
        clients.forEach(function(c) {
          c.close();
        });
        session.emit('close');
      }
    },
    handleRequest: {
      value: function (conn, data) {
        var msg = JSON.parse(data)
        if (msg.command === 'attach') {
          if(!debug) {
            debug = debugr.attachDebugger(msg.arguments.debugPort);
            debug.on('data', function (data) {
              var conn, bmsg;
              if (data.type === 'response' && direct.indexOf(data.command) > -1) {
                conn = getConnection(data);
                if (conn) {
                  conn.write(JSON.stringify(data));
                }
                else {
                  console.error('forgot who to reply to');
                }
              }
              else {
                bmsg = breakpointReturnFilter(data);
                clients.forEach(function(c) {
                  c.write(JSON.stringify(bmsg));
                });
              }
            });
            debug.on('close', function () {
              debug = null;
              session.close();
            });
            debug.on('connect', function () {
              clients.push(conn);
              conn.write(JSON.stringify({type:'response',command:'attach',success:true}));
            });
            debug.on('error', function (e) {
              conn.write(JSON.stringify({type:'response',command:'attach',success:false, message: e.message}));
            });
          }
          else if (debug.connected){
            clients.push(conn);
            conn.write(JSON.stringify({type:'response',command:'attach',success:true}));
          }
          return;
        }
        else if (direct.indexOf(msg.command) > -1) {
          pending[msg.seq] = conn;
        }
        else {
          breakpointRequestFilter(msg);
        }
        debug.request(JSON.stringify(msg));
      }
    },
    addClient: {
      value: function (conn) {
        clients.push(conn);
      }
    },
    removeClient: {
      value: function (conn) {
        clients = clients.filter(function(c) { return c !== conn; });
        if (clients.length < 1) {
          session.close();
        }
      }
    }
  });

  return session;
};
