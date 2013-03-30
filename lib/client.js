var net = require('net'),
	Protocol = require('./protocol'),
	CallbackStore = require('./callback').CallbackStore,
	inherits = require('util').inherits

function Client() {
	net.Stream.call(this)
	var protocol = this.protocol = new Protocol()
	this.callbacks = new CallbackStore()
	var socket = this

	this.running = false

	socket.on('data', function (data) {
		protocol.append(data)
	})

	protocol.on('message', this.handleMessage.bind(this))
}

inherits(Client, net.Stream)

function respond(cb) {
	return function (res) {
		cb(res.message, res.body)
	}
}

Client.prototype.handleMessage = function (msg) {
	var obj = msg.body || {}
	if (msg.headers.Type === 'connect') {
		this.emit('ready')
	}
	else if (obj.type === 'response') {
		this.running = obj.running
		if (!obj.success) {
			this.lastError = obj.message
		}
		this.callbacks.exec(obj.request_seq, obj)
	}
	else if (obj.type === 'event') {
		this.emit(obj.event, obj)
	}
}

Client.prototype.request = function (req, cb) {
	req.seq = this.callbacks.add(cb)
	this.write(this.protocol.serialize(req))
}

Client.prototype.version = function (callback) {
	var req = { command: 'version' }
	this.request(req, function (res) {
		callback(res.message, res.body.V8Version)
	})
}

Client.prototype.getScripts = function (callback) {
	this.request({ command: 'scripts' }, respond(callback))
}

Client.prototype.getScriptSource = function (sourceID, callback) {
	var req = {
		command: 'scripts',
		arguments: {
			includeSource: true,
			types: 4,
			ids: [sourceID]
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.setBreakpoint = function (sourceID, lineNumber, columnNumber, enabled, condition, callback) {
	var req = {
		command: 'setbreakpoint',
		arguments: {
			type: 'scriptId',
			target: sourceID,
			line: lineNumber,
			column: columnNumber,
			enabled: enabled,
			condition: condition
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.setBreakpointByUrl = function (lineNumber, url, columnNumber, enabled, condition, callback) {
	var req = {
		command: 'setbreakpoint',
		arguments: {
			type: 'script',
			target: url,
			line: lineNumber,
			column: columnNumber,
			enabled: enabled,
			condition: condition
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.continue = function (step, count, callback) {
	var req = {
		command: 'continue',
		arguments: {
			stepaction: step,
			stepcount: count
		}
	}
	if (!step) {
		delete req.arguments
	}
	this.request(req, respond(callback))
}

Client.prototype.suspend = function (callback) {
	this.request({ command: 'suspend' }, callback)
}

Client.prototype.evaluate = function (expression, frame, context, callback) {
	var req = {
		command: 'evaluate',
		arguments: {
			expression: expression,
			frame: frame,
			global: frame === null,
			disable_break: true,
			additional_context: context,
			maxStringLength: 100000
		}
	}
	if (!frame) {
		delete req.arguments.frame
	}
	this.request(req, respond(callback))
}


Client.prototype.lookup = function (handles, callback) {
	var req = {
		command: 'lookup',
		arguments: {
			handles: handles,
			includeSource: false
		}
	}
	this.request(req, function (res) {
		callback(res.message, res)
	})
}

Client.prototype.backtrace = function (callback) {
	var req = {
		command: 'backtrace',
		arguments: {
			inlineRefs: true,
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.frame = function (number, callback) {
	var req = {
		command: 'frame',
		arguments: {
			number: number
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.scope = function (scopeNumber, frameNumber, callback) {
	var req = {
		command: 'scope',
		arguments: {
			number: scopeNumber,
			frameNumber: frameNumber,
			inlineRefs: true
		}
	}
	this.request(req, function (res) {
		callback(res.message, res)
	})
}

Client.prototype.scopes = function (frameNumber, callback) {
	var req = {
		command: 'scopes',
		arguments: {
			frameNumber: frameNumber
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.source = function (frameNumber, fromLine, toLine, callback) {
	var req = {
		command: 'source',
		arguments: {
			frame: frameNumber,
			fromLine: fromLine,
			toLine: toLine
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.changeBreakpoint = function (breakNumber, enabled, condition, ignoreCount, callback) {
	var req = {
		command: 'changebreakpoint',
		arguments: {
			breakpoint: breakNumber,
			enabled: enabled,
			condition: condition,
			ignoreCount: ignoreCount
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.clearBreakpoint = function (breakNumber, callback) {
	var req = {
		command: 'clearbreakpoint',
		arguments: {
			breakpoint: breakNumber
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.setExceptionBreak = function (type, enabled, callback) {
	var req = {
		command: 'setexceptionbreak',
		arguments: {
			type: type,
			enabled: enabled
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.v8flags = function (flags, callback) {
	var req = {
		command: 'v8flags',
		arguments: {
			flags: flags
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.disconnect = function (callback) {
	var req = {
		command: 'disconnect'
	}
	this.request(req)
	this.end()
}

Client.prototype.gc = function (callback) {
	var req = {
		command: 'gc',
		arguments: {
			type: 'all'
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.listBreakpoints = function (callback) {
	var req = {
		command: 'listbreakpoints'
	}
	this.request(req, respond(callback))
}

Client.prototype.references = function (type, handle, callback) {
	var req = {
		command: 'references',
		arguments: {
			type: type,
			handle: handle
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.changeLive = function (scriptId, newContent, preview, callback) {
	var req = {
		command: 'changelive',
		arguments: {
			script_id: scriptId,
			preview_only: preview,
			new_source: newContent
		}
	}
	this.request(req, respond(callback))
}

Client.prototype.nil = function () {
	this.request = function (req, cb) {
		cb({ success: false, message: 'not connected'})
	}
}

module.exports = Client
