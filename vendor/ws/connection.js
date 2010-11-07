/*-----------------------------------------------
  Requirements:
-----------------------------------------------*/
var sys = require("sys")
  , Url = require("url")
  , Events = require("events")
  , Buffer = require("buffer").Buffer
  , Crypto = require("crypto");

/*-----------------------------------------------
  The Connection:
-----------------------------------------------*/
module.exports = Connection;

// Our connection instance:
function Connection(server, req, socket, data){
  this.debug = server.debug;

  if (this.debug) {
    debug = function (id, data) { sys.error('\033[90mWS: ' + Array.prototype.join.call(arguments, ", ") + "\033[39m"); };
  } else {
    debug = function (id, data) { };
  }

  Events.EventEmitter.call(this);

  this._req = req;
  this._server = server;
  this.headers = this._req.headers;
  this.id = server.manager.createId(this._req.socket.remotePort);

  var _firstFrame = false;

  Object.defineProperties(this, {
    version: {
      get: function(){
        if(this._req.headers["sec-websocket-key1"] && this._req.headers["sec-websocket-key2"]){
          return "draft76";
        } else {
          return "draft75";
        }
      }
    }
  });


  if(server.options.datastore){
    var storage;

    if(typeof server.options.datastore === "object" || typeof server.options.datastore === "function"){
      storage = server.options.datastore;
    } else if(server.options.datastore === true){
      storage = require("./mem-store");
    } else {
      storage = false;
    }
  }

  // Start to process the connection
  if( !checkVersion(this)) {
    this.reject("Invalid version.");
  } else {
    var connection = this
      , parser;

    // Let the debug mode know that we have a connection:
    this.debug && debug(this.id, this.version+" connection");

    // Set the initial connecting state.
    this.state(1);

    // Handle incoming data:
    parser = new Parser(this);

    socket.addListener("data", function(data){
      if(data.length == 2 && data[0] == 0xFF && data[1] == 0x00){
        connection.state(5);
      } else {
        parser.write(data);
      }
    });

    // Handle the end of the stream, and set the state
    // appropriately to notify the correct events.
    socket.addListener("end", function(){
      connection.state(5);
    });

    socket.addListener('timeout', function () {
      debug(connection.id, "timed out");
      server.emit("timeout", connection);
      connection.emit("timeout");
    });

    socket.addListener("error", function(e){
      if(e.errno == 32){
        connection.state(5);
        closeClient(connection);
        connection.state(6);
      } else {
        manager.emit("error", connection, e);
        connection.emit("error", e);
        connection.state(5);
      }
    });


    // Setup the connection manager's state change listeners:
    this.addListener("stateChange", function(state, laststate){
      //debug(connection.id, "Change state: "+laststate+" => "+state);
      if(state === 4){
        if(storage && storage.create){
          connection.storage = storage.create();
        } else if(storage){
          connection.storage = storage;
        }

        server.manager.attach(connection.id, connection);
        server.emit("connection", connection);

        if(_firstFrame){
          parser.write(_firstFrame);
          delete _firstFrame;
        }

      } else if(state === 5){
        connection.close();
      } else if(state === 6 && laststate === 5){

        if(connection.storage && connection.storage.disconnect){
          connection.storage.disconnect(connection.id);
        }

        server.manager.detach(connection.id, function(){
          server.emit("close", connection);
          connection.emit("close");
        });
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
    if(this.version == "draft75"){
      this.handshake();
    }

    if(this.version == "draft76"){
      if(data.length >= 8){
        this._upgradeHead = data.slice(0, 8);

        _firstFrame = data.slice(8, data.length);

        this.handshake();
      } else {
        this.reject("Missing key3");
      }
    }
  }
};

sys.inherits(Connection, Events.EventEmitter);

/*-----------------------------------------------
  Various utility style functions:
-----------------------------------------------*/
var writeSocket = function(socket, data, encoding) {
  if(socket.writable){
    try {
      socket.write(data, encoding);
      return true;
    } catch(e){
      debug(null, "Error on write: "+e.toString());
      return false;
    }
  }
  return false;
};

var closeClient = function(client){
  client._req.socket.flush();
  client._req.socket.end();
  client._req.socket.destroy();
  debug(client.id, "socket closed");
  client.state(6);
};

function checkVersion(client){
  var server_version = client._server.options.version.toLowerCase();

  return (server_version == "auto" || server_version == client.version);
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
  if(this._req.headers["host"] === undefined){
    this.reject("Missing host header");
    return;
  }

  var location = ""
    , secure = this._req.socket.secure
    , host = this._req.headers.host.split(":")
    , port = host[1] !== undefined ? host[1] : (secure ? 443 : 80);

  location += secure ? "wss://" : "ws://";
  location += host[0];

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
  5. closing
  6. closed
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

Connection.prototype.send = Connection.prototype.write;

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
    writeSocket(socket, "\xff", "binary");
    writeSocket(socket, "\x00", "binary");
  }
  closeClient(this);
};


Connection.prototype.reject = function(reason){
  this.debug && debug(this.id, "rejected. Reason: "+reason);

  this.emit("rejected");
  closeClient(this);
};

Connection.prototype.handshake = function(){
  if(this._state < 3){
    this.debug && debug(this.id, this.version+" handshake");

    this.state(3);

    doHandshake[this.version].call(this);
  } else {
    this.debug && debug(this.id, "Already handshaked.");
  }
};

/*-----------------------------------------------
  Do the handshake.
-----------------------------------------------*/
var doHandshake = {
  // Using draft75, work out and send the handshake.
  draft75: function(){
    var location = websocket_location.call(this), res;

    if(location){
      res = "HTTP/1.1 101 Web Socket Protocol Handshake\r\n"
          + "Upgrade: WebSocket\r\n"
          + "Connection: Upgrade\r\n"
          + "WebSocket-Origin: "+websocket_origin.call(this)+"\r\n"
          + "WebSocket-Location: "+location;

      if(this._server.options.subprotocol && typeof this._server.options.subprotocol == "string") {
        res += "\r\nWebSocket-Protocol: "+this._server.options.subprotocol;
      }

      writeSocket(this._req.socket, res+"\r\n\r\n", "ascii");
      this.state(4);
    }
  },

  // Using draft76 (security model), work out and send the handshake.
  draft76: function(){
    var location = websocket_location.call(this), res;

    if(location){
      res = "HTTP/1.1 101 WebSocket Protocol Handshake\r\n"
          + "Upgrade: WebSocket\r\n"
          + "Connection: Upgrade\r\n"
          + "Sec-WebSocket-Origin: "+websocket_origin.call(this)+"\r\n"
          + "Sec-WebSocket-Location: "+location;

      if(this._server.options.subprotocol && typeof this._server.options.subprotocol == "string") {
        res += "\r\nSec-WebSocket-Protocol: "+this._server.options.subprotocol;
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

        res += "\r\n\r\n";
        res += hash.digest("binary");

        writeSocket(this._req.socket, res, "binary");
        this.state(4);
      }
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
