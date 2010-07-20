
var sys = require("sys")
  , events = require("events")
  , Buffer = require("buffer").Buffer
  , Crypto = require("crypto");


/*-----------------------------------------------
  Debugged
-----------------------------------------------*/
var debug;

/*-----------------------------------------------
  The Connection:
-----------------------------------------------*/
module.exports = Connection;

function Connection(server, req, socket, upgradeHead){
  this.debug = server.debug;

  if (this.debug) {
    debug = function () { sys.error('\033[90mWS: ' + Array.prototype.join.call(arguments, ", ") + "\033[39m"); };
  } else {
    debug = function () { };
  }

  this._req = req;
  this._server = server;
  this._upgradeHead = upgradeHead;
  this.id = this._req.socket.remotePort;

  events.EventEmitter.call(this);

  this.version = this.getVersion();

  if( !checkVersion(this)) {
    this.reject("Invalid version.");
  } else {
    debug(this.id, this.version+" connection");

    // Set the initial connecting state.
    this.state(1);

    var connection = this;
    // Handle incoming data:
    var parser = new Parser(this);
    req.socket.addListener("data", function(data){
      if(connection._state == 2){
        connection._upgradeHead = data;
      } else {
        parser.write(data);
      }
    });

    // Handle the end of the stream, and set the state
    // appropriately to notify the correct events.
    req.socket.addListener("end", function(){
      connection.state(5);
    });

    // Setup the connection manager's state change listeners:
    this.addListener("stateChange", function(state, oldstate){
      if(state == 5){
        server.manager.detach(connection.id, function(){
          server.emit("close", connection);
          connection.emit("close");
        });
      } else if(state == 4){
        server.manager.attach(connection.id, connection);
        server.emit("connection", connection);
      }
    });

    // Let us see the messages when in debug mode.
    if(this.debug){
      this.addListener("message", function(msg){
        debug(connection.id, "recv: " + msg);
      });
    }

    // Carry out the handshaking.
    //    - Draft75: There's no upgradeHead, goto Then.
    //      Draft76: If there's an upgradeHead of the right length, goto Then.
    //      Then: carry out the handshake.
    //
    //    - Currently no browsers to my knowledge split the upgradeHead off the request,
    //      but in the case it does happen, then the state is set to waiting for
    //      the upgradeHead.
    //
    //      HANDLING FOR THIS EDGE CASE IS NOT IMPLEMENTED.
    //
    if((this.version == "draft75") || (this.version == "draft76" && this._upgradeHead && this._upgradeHead.length == 8)){
      this.handshake();
    } else {
      this.state(2);
      debug(this.id, "waiting.");
    }
  }
};

sys.inherits(Connection, events.EventEmitter);

// <<DEPRECATED

var warned = false;
Object.defineProperty(Connection.prototype, "_id", {
  get: function(){
    if(!warned){
      sys.error('`Connection._id` will be removed in future versions of Node, please use `Connection.id`.');
      warned = true;
    }

    return this.id;
  }
});

// DEPRECATED>>

/*-----------------------------------------------
  Various utility style functions:
-----------------------------------------------*/
var writeSocket = function(socket, data, encoding) {
  if(socket.writable){
    socket.write(data, encoding);
    return true;
  }
  return false;
};

var closeClient = function(client){
  client._req.socket.end();
  client._req.socket.destroy();
  client.state(5);
  debug(client.id, "closed");
};

function checkVersion(client){
  var server_version = client._server.options.version.toLowerCase()
    , client_version = client.version = client.version || client.getVersion();

  return (server_version == "auto" || server_version == client_version);
};


function pack(num) {
  var result = '';
  result += String.fromCharCode(num >> 24 & 0xFF);
  result += String.fromCharCode(num >> 16 & 0xFF);
  result += String.fromCharCode(num >> 8 & 0xFF);
  result += String.fromCharCode(num &	0xFF);
  return result;
};


/*-----------------------------------------------
  Formatters for the urls
-----------------------------------------------*/
function websocket_origin(){
  var origin = this._server.options.origin || "*";
  if(origin == "*" || Array.isArray(origin)){
    origin = this._req.headers.origin;
  }
  return origin;
};

function websocket_location(){
  var location = "",
      secure = this._req.socket.secure,
      request_host = this._req.headers.host.split(":"),
      port = request_host[1];

  if(secure){
    location += "wss://";
  } else {
    location += "ws://";
  }

  location += request_host[0]

  if(!secure && port != 80 || secure && port != 443){
    location += ":"+port;
  }

  location += this._req.url;

  return location;
};


/*-----------------------------------------------
  0. unknown
  1. opening
  2. waiting
  3. handshaking
  4, connected
  5. closed
-----------------------------------------------*/
Connection.prototype._state = 0;


/*-----------------------------------------------
  Connection Public API
-----------------------------------------------*/
Connection.prototype.state = function(state){
  if(state !== undefined && typeof state === "number"){
    var oldstate = this._state;
    this._state = state;
    this.emit("stateChange", this._state, oldstate);
  }
};

Connection.prototype.getVersion = function(){
  if(this._req.headers["sec-websocket-key1"] && this._req.headers["sec-websocket-key2"]){
    return "draft76";
  } else {
    return "draft75";
  }
};


Connection.prototype.write = function(data){
  var socket = this._req.socket;

  if(this._state == 4){
    debug(this.id, "write: "+data);

    if(
      writeSocket(socket, "\x00", "binary") &&
      writeSocket(socket, data, "utf8") &&
      writeSocket(socket, "\xff", "binary")
    ){
      return true;
    } else {
      debug(this.id, "\033[31mERROR: write: "+data);
    }
  } else {
    debug(this.id, "\033[31mCouldn't send.");
  }
  return false;
};

Connection.prototype.broadcast = function(data){
  var conn = this;

  this._server.manager.forEach(function(client){
    if(client && client._state === 4 && client.id != conn.id){
      client.write(data);
    }
  });
};

Connection.prototype.close = function(){
  var socket = this._req.socket;

  if(this._state == 4 && socket.writable){
    writeSocket(socket, "\x00", "binary");
    writeSocket(socket, "\xff", "binary");
  }
  closeClient(this);
};


Connection.prototype.reject = function(reason){
  debug(this.id, "rejected. Reason: "+reason);

  this.emit("rejected");
  closeClient(this);
};


Connection.prototype.handshake = function(){
  if(this._state < 3){
    debug(this.id, this.version+" handshake");

    this.state(3);

    doHandshake[this.version].call(this);
  } else {
    debug(this.id, "Already handshaked.");
  }
};

/*-----------------------------------------------
  Do the handshake.
-----------------------------------------------*/
var doHandshake = {
  /* Using draft75, work out and send the handshake. */
  draft75: function(){
    var res = "HTTP/1.1 101 Web Socket Protocol Handshake\r\n"
            + "Upgrade: WebSocket\r\n"
            + "Connection: Upgrade\r\n"
            + "WebSocket-Origin: "+websocket_origin.call(this)+"\r\n"
            + "WebSocket-Location: "+websocket_location.call(this);

    if(this._server.options.subprotocol && typeof this._server.options.subprotocol == "string") {
      res += "\r\nWebSocket-Protocol: "+this._server.options.subprotocol;
    }

    writeSocket(this._req.socket, res+"\r\n\r\n", "ascii");
    this.state(4);
  },

  /* Using draft76 (security model), work out and send the handshake. */
  draft76: function(){
    var data = "HTTP/1.1 101 WebSocket Protocol Handshake\r\n"
            + "Upgrade: WebSocket\r\n"
            + "Connection: Upgrade\r\n"
            + "Sec-WebSocket-Origin: "+websocket_origin.call(this)+"\r\n"
            + "Sec-WebSocket-Location: "+websocket_location.call(this);

    if(this._server.options.subprotocol && typeof this._server.options.subprotocol == "string") {
      data += "\r\nSec-WebSocket-Protocol: "+this._server.options.subprotocol;
    }

    var strkey1 = this._req.headers['sec-websocket-key1']
      , strkey2 = this._req.headers['sec-websocket-key2']

      , numkey1 = parseInt(strkey1.replace(/[^\d]/g, ""), 10)
      , numkey2 = parseInt(strkey2.replace(/[^\d]/g, ""), 10)

      , spaces1 = strkey1.replace(/[^\ ]/g, "").length
      , spaces2 = strkey2.replace(/[^\ ]/g, "").length;


    if (spaces1 == 0 || spaces2 == 0 || numkey1 % spaces1 != 0 || numkey2 % spaces2 != 0) {
      this.reject("WebSocket contained an invalid key -- closing connection.");
    } else {
      var hash = Crypto.createHash("md5")
        , key1 = pack(parseInt(numkey1/spaces1))
        , key2 = pack(parseInt(numkey2/spaces2));

      hash.update(key1);
      hash.update(key2);
      hash.update(this._upgradeHead.toString("binary"));

      data += "\r\n\r\n";
      data += hash.digest("binary");

      writeSocket(this._req.socket, data, "binary");
      this.state(4);
    }
  }
};

/*-----------------------------------------------
  The new onData callback for
  http.Server IncomingMessage
-----------------------------------------------*/
var Parser = function(client){
  this.frameData = [];
  this.order = 0;
  this.client = client;
};

Parser.prototype.write = function(data){
  var pkt, msg;
  for(var i = 0, len = data.length; i<len; i++){
    if(this.order == 0){
      if(data[i] & 0x80 == 0x80){
        this.order = 1;
      } else {
        this.order = -1;
      }
    } else if(this.order == -1){
      if(data[i] === 0xFF){
        pkt = new Buffer(this.frameData);
        this.order = 0;
        this.frameData = [];

        this.client.emit("message", pkt.toString("utf8", 0, pkt.length));
      } else {
        this.frameData.push(data[i]);
      }
    } else if(this.order == 1){
      debug(this.client.id, "High Order packet handling is not yet implemented.");
      this.order = 0;
    }
  }
};

/*
function ondata(data, start, end){
  if(this.state == 2 && this.version == "draft76"){
    // TODO: I need to figure out an alternative here.
    // data.copy(this._req.upgradeHead, 0, start, end);
    debug.call(this, "Using draft76 & upgrade body not sent with request.");
    this.reject("missing upgrade body");
  // Assume the data is now a message:
  } else if(this.state == 4){
    data = data.slice(start, end);

    var frame_type = null, length, b;
    var parser_offset = -1;
    var raw_data = [];

    while(parser_offset < data.length-2){
      frame_type = data[parser_offset++];

      if(frame_type & 0x80 == 0x80){
        debug.call(this, "high");
        b = null;
        length = 1;
        while(length--){
          b = data[parser_offset++];
          length = length * 128 + (b & 0x7F);
          if(b & 0x80 == 0){
            break;
          }
        }
        parser_offset += length;
        if(frame_type == 0xFF && length == 0){
          this.close();
        }
      } else {
        raw_data = [];

        while(parser_offset <= data.length){
          b = data[parser_offset++];
          if(b == 0xFF){
            var buf = new Buffer(raw_data);
            this.emit("message", buf.toString("utf8", 0, buf.length));
            break;
          }
          raw_data.push(b);
        }
      }
    }
  }
};
*/
