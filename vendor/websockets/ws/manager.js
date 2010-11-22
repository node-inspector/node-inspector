var debug = function(){};

var util = require("../_util")
  , events = require("../_events");

/*-----------------------------------------------
  Connection Manager
-----------------------------------------------*/
module.exports = Manager;

function Manager(options) {
  events.EventEmitter.call(this);
  
  if(options.debug) {
    var self = this;
    debug = function(msg, connection) {
      if(connection && connection.id) {
        util.error('\033[31mManager: ' +msg+ ": <Connection "+connection.id+"> ("+self._length+")\033[39m");
      } else {
        util.error('\033[31mManager: ' +Array.prototype.join.call(arguments, " ")+" ("+self._length+")\033[39m");
      }
    };
  }
  
  this._head = null;
  this._tail = null;
  this._length = 0;
  this._counter = 0;
};

util.inherits(Manager, events.EventEmitter);

Object.defineProperty(Manager.prototype, "length", {
  get: function() {
    return this._length;
  }
});

Manager.prototype.createId = function(remotePort) {
  return process.pid + "" + remotePort + "" + (this._counter++);
};

Manager.prototype.inspect = function() {
  return "<WS:Manager "+this._length+" (total: "+this._counter+")>";
};

Manager.prototype.attach = function(connection) {
  var client = {
    id:     connection.id,
    _next:  null,
    connection: connection
  };

  if(this._length == 0) {
    this._head = client;
    this._tail = client;
  } else {
    this._tail._next = client;
    this._tail = client;
  }

  ++this._length;
  
  this.emit("attach", connection);
  debug("Attached", connection);
};

Manager.prototype.detach = function(connection) {
  var previous = current = this._head
    , id = connection.id;

  while(current !== null) {
    if(current.id === id) {
      previous._next = current._next;
      
      if(current.id === this._head.id) {
        this._head = current._next;
      }
      
      if(current.id === this._tail.id) {
        this._tail = previous;
      }
      
      this._length--;
      this.emit("detach", connection);
      
      debug("Detached", connection);
      break;
    } else {
      previous = current;
      current = current._next;
    }
  }
  
  if(current === null) {
    debug("Detach Failed", connection);
  }

  delete current, previous;
};

Manager.prototype.find = function(id, callback, thisArg) {
  var current = this._head;

  while(current !== null) {
    if(current.id === id) {
      callback.call(thisArg, current.connection);
      break;
    } else {
      current = current._next;
    }
  }
};

Manager.prototype.forEach = function(callback, thisArg){
  var current = this._head;

  while(current !== null) {
    callback.call(thisArg, current.connection);
    current = current._next;
  }
};

Manager.prototype.map = function(callback, thisArg){
  var current = this._head
    , result = []
    , len = 0;

  while(current !== null) {
    result.push(callback.call(thisArg, current.connection, len, this._head));
    current = current._next;
    len++;
  }

  return result;
};

Manager.prototype.filter = function(callback, thisArg){
  var current = this._head
    , result = []
    , len = 0;

  while(current !== null) {
    if( Boolean(callback.call(thisArg, current.connection, len, this._head)) ) {
      result.push(current.connection);
    }
    
    current = current._next;
    len++;
  }

  return result;
};
