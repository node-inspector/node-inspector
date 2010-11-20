/*-----------------------------------------------
  Requirements:
-----------------------------------------------*/
var http   = require("http")
  , path   = require("path");

var util   = require("../_util")
  , events = require("../_events");

var Manager = require("./manager")
  , Connection = require("./connection")
  , Mixin = require("../lang/mixin");

/*-----------------------------------------------
  Reflectors:
-----------------------------------------------*/
function reflectEvent(sEmitter, sType, tEmitter, tType) {
  sEmitter.addListener(sType, function(){
    tEmitter.emit.apply(tEmitter, [tType || sType].concat(Array.prototype.slice.call(arguments)));
  });
};

function reflectMethod(sObject, sMeth, tObject, tMeth) {
  tObject[tMeth || sMeth] = function(){
    return sObject[sMeth].apply(sObject, arguments);
  };
};

function clientWrite(client, data) {
  if(client && client._state === 4){
    client.write(data);
  }
};

/*-----------------------------------------------
  WebSocket Server Exports:
-----------------------------------------------*/
exports.Server = Server;
exports.createServer = function(options){
  return new Server(options);
};

/*-----------------------------------------------
  WebSocket Server Implementation:
-----------------------------------------------*/
function Server(o){
  events.EventEmitter.call(this);

  var options = Mixin({
    debug: false,
    server: new http.Server()
  }, o);

  var manager = new Manager(options)
    , server  = options.server;

  if(options.datastore){
    throw new Error("Built-in DataStore has been removed, see: http://github.com/miksago/nws-memstore");
  }
  
  server.on("upgrade", function(req, socket, upgradeHead){
    if( req.method == "GET" && ( req.headers["upgrade"] && req.headers["connection"] ) &&
        req.headers.upgrade.toLowerCase() == "websocket" && req.headers.connection.toLowerCase() == "upgrade"
    ){
      new Connection(manager, options, req, socket, upgradeHead);
    }
  });

  manager.bubbleEvent("error", this);

  reflectEvent(  manager, "attach",      this, "connection");
  reflectEvent(  manager, "detach",      this, "disconnect");

  reflectEvent(  server,  "listening",   this);
  reflectEvent(  server,  "request",     this);
  reflectEvent(  server,  "stream",      this);
  reflectEvent(  server,  "close",       this);
  reflectEvent(  server,  "clientError", this);
  reflectEvent(  server,  "error",       this);

  reflectMethod( server,  "listen",      this);
  reflectMethod( server,  "close",       this);

  this.send = function(id, data){
    manager.find(id, function(client){
      clientWrite(client, data);
    });
  };

  this.broadcast = function(data){
    manager.forEach(function(client){ 
      clientWrite(client, data);
    });
  };

  this.server  = server;
  this.manager = manager;
  this.options = options;
};

util.inherits(Server, events.EventEmitter);

