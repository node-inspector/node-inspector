var Client = require('./client')
var EventEmitter = require('events').EventEmitter
var Debugger = require('./front-end/debugger')
var Console = require('./front-end/console')
var Runtime = require('./front-end/runtime')
var inherits = require('util').inherits
var Browser = require('./front-end/browser')
var async = require('async')
var v2w = require('./v2w')
var nilBrowser = {
		sendEvent: function () {
			console.log('Browser disconnected')
		},
		sendResponse: function () {
			console.log('Browser disconnected')
		}
	}
function noop() {}

function Session(debugPort) {
	var self = this
	this.createClient()
	this.browser = nilBrowser
	this.debugPort = debugPort
}
inherits(Session, EventEmitter)

Session.prototype.createClient = function () {
	var self = this
	this.client = new Client()
	this.client.on('break', function (msg) {
		self.debugger.breakEvent(msg)
	})
	this.client.on('close', function () {
		self.debugger.globalObjectCleared()
		clearTimeout(self.pollTimeout)
		self.createClient()
	})
	this.client.on('ready', function () {
		self.ready = true
	})
	this.client.on('exception', function (msg) {
		self.debugger.breakEvent(msg)
	})
	this.client.on('error', function (err) {
		console.error(err.message)
		process.exit(1)
	})
	this.debugger = new Debugger(this.client)
	this.console = new Console(this.client)
	this.runtime = new Runtime(this.client)

	this.debugger.on('event', function (name, data) {
		self.browser.sendEvent(name, data)
	})
	this.debugger.on('enabled', function () {
		self.browserConnectedFlow()
	})
}

Session.prototype.attach = function () {
	if (this.client.readyState !== 'open') {
		this.client.connect(this.debugPort)
	}
}

Session.prototype.join = function (ws) {
	this.browser = new Browser(ws, this)
}

Session.prototype.browserConnectedFlow = function () {
	var self = this
	async.waterfall(
		[
			function (next) {
				self.debugger.resetScripts()
				self.pollScripts(next)
			},
			function (next) {
				if (!self.client.running) {
					self.debugger.getBacktrace(next)
				}
				else {
					next()
				}
			},
			function (next) {
				self.client.listBreakpoints(next)
			},
			function (body, next) {
				async.forEach(
					body.breakpoints,
					function (bp, nxt) {
						self.client.clearBreakpoint(bp.number, nxt)
					},
					function (err) {
						next()
					})
			}
		],
		function (err) {
			if (err) console.error(err)
		})
}

Session.prototype.pollScripts = function (callback) {
	var self = this
	this.client.getScripts(function (err, body) {
		if (body) {
			self.parsedScripts(body)
		}
		if (callback) {
			callback()
		}
		self.pollTimeout = setTimeout(self.pollScripts.bind(self), 3000)
	})
}

Session.prototype.parsedScripts = function (body) {
	var self = this
	var scripts = body.forEach(
		function (s) {
			self.debugger.scriptParsed(
				{ scriptId: String(s.id)
				, url: s.name
				, startLine: s.lineOffset
				, startColumn: s.columnOffset
				, endLine: s.lineCount
				, endColumn: 0
				, isContentScript: false
				}
			)
		}
	)
}

module.exports = Session
