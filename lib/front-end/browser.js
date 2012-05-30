var EventEmitter = require('events').EventEmitter,
	inherits = require('util').inherits,
	nilSocket = {
		send: function () {
			console.log('socket disconnected')
		}
	}

function Browser(socket, session) {
	this.socket = socket
	this.session = session
	this.verbose = process.argv.some(function (x) { return x === '-v'})
	this.socket.on('message', this.handleRequest.bind(this))
	this.socket.on('disconnect', this.disconnect.bind(this))
}
inherits(Browser, EventEmitter)

Browser.prototype.disconnect = function () {
	this.socket = nilSocket
	this.emit('disconnect')
}

Browser.prototype.handleRequest = function (data) {
	var msg = JSON.parse(data)
	var moduleMethod = msg.method.split('.')
	var module = this.session[moduleMethod[0].toLowerCase()]
	if (module) {
		var command = module[moduleMethod[1]]
	}
	if (this.verbose) {
		console.log('\033[32m' + data + '\033[39m' + '\n')
	}
	if (typeof command === 'function') {
		command.call(module, msg.params, this.sendResponse.bind(this, msg.id))
	}
	else {
		this.sendResponse(msg.id, msg.method + " not implemented")
	}
}

Browser.prototype.sendResponse = function (id, error, data) {
	data = data || {}
	if (this.verbose) {
		console.log(
			'\033[35m' + id + '\033[39m : ' +
			'\033[33m' + JSON.stringify(error) +
			' ' + JSON.stringify(data) + '\033[39m\n')
	}
	this.socket.send(
		JSON.stringify({
			id: id,
			error: error,
			result: data
		})
	)
}

Browser.prototype.sendEvent = function (name, data) {
	data = data || {}
	if (this.verbose) {
		console.log(
			'\033[35m' + name + '\033[39m : ' +
			'\033[34m' + JSON.stringify(data) + '\033[39m')
	}
	this.socket.send(
		JSON.stringify({
			method: name,
			params: data
		})
	)
}

module.exports = Browser
