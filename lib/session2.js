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
	this.client = new Client()
	this.client.on('break', function (msg) {
		self.breakEventFlow(msg)
	})
	this.client.on('close', function () {
		self.debugger.globalObjectCleared()
		self.client = null //TODO nilClient
	})
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
			//TODO: start polling for script changes (?)
		})
}

Session.prototype.parsedScriptsFlow = function (body) {
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
		this.debugger.getBacktrace()
	}
	else {
		this.debugger.resume(null, noop)
	}
}

module.exports = Session
