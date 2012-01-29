var EventEmitter = require('events').EventEmitter,
	inherits = require('util').inherits,
	nilSocket = {
		send: function () {
			console.log('socket disconnected')
		}
	}

function Browser(socket, session) {
	var self = this
	this.socket = socket
	this.session = session
	this.socket.on('message',
		function (data) {
			self.handleRequest(data)
		}
	)
	this.socket.on('disconnect',
		function () {
			self.emit('disconnect')
			self.socket = nilSocket
		}
	)
}
inherits(Browser, EventEmitter)

function argumentsArray(obj) {
	return Object.keys(obj).map(
		function (x) {
			return obj[x]
		}
	)
}

Browser.prototype.handleRequest = function (data) {
	var msg = JSON.parse(data),
		command = this.session[msg.method.split('.')[1]]

	console.log('\033[32m' + data + '\033[39m' + '\n')
	if (typeof command === 'function') {
		var args = !msg.params ? [] : argumentsArray(msg.params)
		if (msg.id > 0) {
			args.push(msg.id)
		}
		command.apply(this.session, args)
	}
}

Browser.prototype.sendResponse = function (seq, success, data) {
	data = data || {}
	console.log('\033[35m' + seq + '\033[39m : ' + '\033[33m' + JSON.stringify(data) + '\033[39m\n')
	this.socket.send(
		JSON.stringify({
			id: seq,
			success: success,
			result: data
		})
	)
}

Browser.prototype.sendEvent = function (name, data) {
	data = data || {}
	console.log('\033[35m' + name + '\033[39m : ' + '\033[34m' + JSON.stringify(data) + '\033[39m')
	this.socket.send(
		JSON.stringify({
			type: 'event',
			method: name,
			params: data
		})
	)
}

module.exports = Browser
