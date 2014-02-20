var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = WebSocketMock;

function WebSocketMock() {
  this.messages = [];
}

inherits(WebSocketMock, EventEmitter);

WebSocketMock.prototype.send = function(payload) {
  try {
    payload = JSON.parse(payload);
  } catch (e) {
    // no-op, use the original string
  }

  this.messages.push(payload);
  this.emit('send', payload);
};
