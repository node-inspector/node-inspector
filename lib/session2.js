var Client = require('./client'),
	EventEmitter = require('events').EventEmitter,
	Debugger = require('./front-end/debugger'),
	Console = require('./front-end/console'),
	Runtime = require('./front-end/runtime'),
	inherits = require('util').inherits,
	Browser = require('./front-end/browser'),
	async = require('async'),
	v2w = require('./v2w'),
	noop = function () {},
	nilBrowser = {
		sendEvent: function () {
			console.log('Browser disconnected')
		},
		sendResponse: function () {
			console.log('Browser disconnected')
		}
	}


function Session(debugPort) {
	var self = this
	this.client = new Client()
	this.client.on('break', function (msg) {
		self.breakEventFlow(msg)
	})
	this.client.on('close', function () {})
	this.client.on('ready', function () {
		self.ready = true
	})
	this.client.on('exception', function (msg) {
		self.breakEventFlow(msg)
	})
	this.debugger = new Debugger(this.client)
	this.console = new Console(this.client)
	this.runtime = new Runtime(this.client)
	this.browser = nilBrowser

	this.debugger.on('event', function (name, data) {
		self.browser.sendEvent(name, data)
	})
	this.debugger.on('enabled', function () {
		self.browserConnectedFlow()
	})
	this.debugPort = debugPort
}
inherits(Session, EventEmitter)

// commands

Session.prototype.attach = function () {
	this.client.connect(this.debugPort)
}

Session.prototype.join = function (ws) {
	this.browser = new Browser(ws, this)
}

// flows

Session.prototype.getBacktraceFlow = function () {
	var self = this
	this.client.backtrace(function (err, body) {
		self.debugger.paused(v2w.callFrames(body.frames), "other")
	})
}

Session.prototype.browserConnectedFlow = function () {
	var self = this
	async.waterfall(
		[
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
			},
			function (next) {
				self.client.getScripts(next)
			},
			function (body, next) {
				self.parsedScriptsFlow(body)
				next()
			}
		],
		function (err) {
			//self.browser.sendEvent('Debugger.debuggerWasEnabled')
		})
}

Session.prototype.parsedScriptsFlow = function (body) {
	var self = this
	var scripts = body.map(function (s) {
		return {
			scriptId: String(s.id),
			url: s.name,
			data: s.source,
			startLine: s.lineOffset,
			startColumn: s.columnOffset,
			endLine: s.lineCount,
			endColumn: 0,
			isContentScript: false
		}
	})

	scripts.forEach(function (s) {
		self.debugger.scriptParsed(s.scriptId, s.url, s.startLine, s.startColumn, s.endLine, s.endColumn, s.isContentScript)
	})
}

Session.prototype.breakEventFlow = function (msg) {
	if (this.debugger.breakpointsActive) {
		var breakpoints = msg.body.breakpoints || []
		if (breakpoints.indexOf(this.debugger.tempBreakpointId) > -1) {
			var self = this
			this.client.clearBreakpoint(
				this.debugger.tempBreakpointId,
				function (err, body) {
					self.debugger.tempBreakpointId = 0
				}
			)
		}
		this.getBacktraceFlow()
	}
	else {
		this.debugger.resume(null, noop)
	}
}

module.exports = Session
