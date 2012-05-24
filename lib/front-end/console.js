var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits

function Console() {

}

inherits(Console, EventEmitter)

Console.prototype.clearMessages = function (params, callback) {
  callback()
}

Console.prototype.disable = function (params, callback) {
  callback()
}

Console.prototype.enable = function (params, callback) {
  callback()
}

//

Console.prototype.messageAdded = function (message) {
  this.emit('Console.messageAdded', {})
}

Console.prototype.messageRepeatCountUpdated = function (count) {
  this.emit('Console.messageRepeatCountUpdated')
}

Console.prototype.messageCleared = function () {
  this.emit('Console.messageCleared')
}

module.exports = Console
