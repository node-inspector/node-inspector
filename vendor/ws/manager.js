var debug, sys;

/*-----------------------------------------------
  Connection Manager
-----------------------------------------------*/
module.exports = Manager;

function Manager(showDebug){
  if(showDebug) {
    sys = require("sys");
    debug = function(){sys.error('\033[31mManager: ' + Array.prototype.join.call(arguments, ", ") + "\033[39m"); };
  } else {
    debug = function(){};
  }

  this._head = null;
  this._tail = null;
  this._length = 0;
  this._counter = 0;
};

Object.defineProperty(Manager.prototype, "length", {
  get: function(){
    return this._length;
  }
});

Manager.prototype.createId = function(remotePort) {
  return process.pid + "" + remotePort + "" + (this._counter++);
};

Manager.prototype.attach = function(id, client){
  var connection = {
    id:     id,
    _next:  null,
    client: client
  };

  if(this._length == 0) {
    this._head = connection;
    this._tail = connection;
  } else {
    this._tail._next = connection;
    this._tail = connection;
  }

  ++this._length;

  debug("Attached: "+id, this._length);
};

Manager.prototype.detach = function(id, callback){
  var previous = current = this._head;

  while(current !== null){
    if(current.id === id){
      previous._next = current._next;
      this._length--;

      if(current.id === this._head.id){
        this._head = current._next;
      }
      if(current.id === this._tail.id){
        this._tail = previous;
      }

      break;
    } else {
      previous = current;
      current = current._next;
    }
  }

  delete current, previous;

  debug("Detached: "+id, this._length);
  callback();
};

Manager.prototype.find = function(id, callback, thisArg){
  var current = this._head;

  while(current !== null){
    if(current.id === id){
      callback.call(thisArg, current.client);
      break;
    } else {
      current = current._next;
    }
  }
};

Manager.prototype.forEach = function(callback, thisArg){
  var current = this._head;

  while(current !== null){
    callback.call(thisArg, current.client);
    current = current._next;
  }
};

Manager.prototype.map = function(callback, thisArg){
  var current = this._head
    , len = 0
    , result = new Array(this._length);

  while(current !== null){
    result[len] = callback.call(thisArg, current.client, len, this._head);
    current = current._next;
    ++len;
  }

  return result;
};

Manager.prototype.filter = function(callback, thisArg){
  var current = this._head
    , len = 0
    , result = new Array(this._length);

  while(current !== null){
    if( Boolean(callback.call(thisArg, current.client, len, this._head)) ){
      result[len] = current.client;
      ++len;
    }

    current = current._next;
  }

  return result;
};