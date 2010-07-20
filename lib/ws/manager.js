var Events = require("events")
  , sys    = require("sys");

var debug;

/*-----------------------------------------------
  Connection Manager
-----------------------------------------------*/
module.exports = Manager;

function Manager(showDebug){
  if(showDebug) {
    debug = function(){sys.error('\033[31mManager: ' + Array.prototype.join.call(arguments, ", ") + "\033[39m"); };
  } else {
    debug = function(){};
  }
  
  this._head = null;
  this._tail  = null;
  this._length = 0;
};

Object.defineProperty(Manager.prototype, "length", {
  get: function(){
    return this._length;
  }
});


Manager.prototype.attach = function(id, client){
  var connection = {
    _prev:  null,
    _next:  null,
    id:     id,
    client: client
  };
  
  if(this._length == 0) {
    this._head = connection;
    this._tail = connection;
  } else {
    this._head._prev = connection;
    connection._next = this._head;
    this._head = connection;
  }
  
  ++this._length;
  debug("Attached: "+id);
};

Manager.prototype.detach = function(id, callback){
  var current = this._tail;
  
  if(this._length == 1 && current.id == id){
    this._head = {
      _prev:  null,
      _next:  null
    };
    this._tail = null;
  } else {
    while(current && current.id !== id){
      current = current._prev;
    }
    if(current !== null){
      if(current._prev !== null){
        current._prev._next = current._next;
      }
    
      if(current._next !== null){
        current._next._prev = current._prev;
      }
    }
  }
  
  this._length--;
  
  debug("Detached: "+id);
  callback();
};

Manager.prototype.find = function(id, callback){
  var current = this._head;
  
  while(current && current.id !== id){
    current = current._next;
  }
  
  if(current !== null && current.id === id && current.client){
    callback(current.client);
  }
};

Manager.prototype.forEach = function(callback, thisArg){
  var context = (typeof thisArg !== "undefined" && thisArg !== null) ? thisArg : this;
  var current = this._head;
  
  while(current && current.client){
    callback.call(context, current.client);
    current = current._next;
  }
};