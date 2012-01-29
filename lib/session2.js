var Client = require('./client'),
	EventEmitter = require('events').EventEmitter,
	inherits = require('util').inherits,
	Browser = require('./browser'),
	async = require('async'),
	v2w = require('./v2w'),
	nop = function () {},
	nilBrowser = {
		sendEvent: function () {
			console.log('Browser disconnected')
		},
		sendResponse: function () {
			console.log('Browser disconnected')
		}
	}


function Session(debugPort) {
	this.client = new Client()
	this.browser = nilBrowser
	this.debugPort = debugPort
	this.breakpointsActive = true
}
inherits(Session, EventEmitter)

// commands

Session.prototype.getScriptSource = function (sourceID, seq) {
	var self = this
	this.client.getScriptSource(sourceID, function (err, body) {
		self.browser.sendResponse(seq, !err, { setScriptSource: body[0].source })
	})
}

Session.prototype.setScriptSource = function (sourceID, newContent, preview, seq) {
	if (seq === undefined) {
		seq = preview
		preview = false
	}
	var self = this
	this.client.changeLive(sourceID, newContent, preview, function (err, body) {
		self.browser.sendResponse(seq, true, {
			success: !err,
			newBodyOrErrorMessage: err || newContent
		})
	})
}

Session.prototype.setPauseOnExceptions = function (state, seq) {
	this.browser.sendResponse(seq, true)
}

Session.prototype.continueToLocation = function (location, id) {}

Session.prototype.stepOut = function () {
	this.client.resume('out', 1, nop)
	this.browser.sendEvent('Debugger.resumed')
}

Session.prototype.stepInto = function () {
	this.client.resume('in', 1, nop)
	this.browser.sendEvent('Debugger.resumed')
}

Session.prototype.stepOver = function () {
	this.client.resume('next', 1, nop)
	this.browser.sendEvent('Debugger.resumed')
}

Session.prototype.resume = function () {
	this.client.resume(null, null, nop)
	this.browser.sendEvent('Debugger.resumed')
}

Session.prototype.pause = function () {
	var self = this
	this.client.suspend(
		function (msg) {
			if (!msg.running) {
				self.getBacktrace()
			}
		}
	)
}

Session.prototype.removeBreakpoint = function (breakpointId, seq) {
	var self = this
	this.client.clearBreakpoint(breakpointId,
		function (err, body) {
			self.browser.sendResponse(seq, !err)
		}
	)
}

Session.prototype.setBreakpointByUrl = function (lineNumber, url, columnNumber, condition, seq) {
	if (seq === undefined) seq = condition
	var self = this
	this.client.setBreakpointByUrl(lineNumber, url, columnNumber, true, condition,
		function (err, body) {
			var locations = body.actual_locations.map(
				function (x) {
					return { lineNumber: x.line, columnNumber: x.column }
				}
			)
			self.browser.sendResponse(seq, true, { breakpointId: body.breakpoint + '', locations: locations})
		}
	)
}

Session.prototype.setBreakpoint = function (location, condition, seq) {
	var self = this
	this.client.setBreakpoint(location.scriptId, location.lineNumber, location.columnNumber, true, condition,
		function (err, body) {
			if (!err) {
				var locations = body.actual_locations.map(
					function (x) {
						return { lineNumber: x.line, columnNumber: x.column }
					}
				)
				self.browser.sendResponse(seq, true, { breakpointId: body.breakpoint + '', locations: locations[0]})
			}
		}
	)
}

Session.prototype.clearConsoleMessages = function (seq) {
	this.browser.sendEvent('Console.messagesCleared')
}

Session.prototype.getInspectorState = function (seq) {
	this.browser.sendResponse(seq, true, {
		state: {
			monitoringXHREnabled: false,
			resourceTrackingEnabled: false
		}
	})
}

Session.prototype.populateScriptObjects = function (seq) {
	this.browser.sendResponse(seq, true)
}

Session.prototype.disableDebugger = nop

Session.prototype.callFunctionOn = function (
	objectId,
	functionDeclaration,
	args,
	returnByValue,
	seq) {
	if (seq === undefined) seq = returnByValue
	var handle = +(objectId.split(':')[2])
	this.client.lookup([handle], function (err, msg) {
		//TODO
	})
}

Session.prototype.setBreakpointsActive = function (active, seq) {
	this.breakpointsActive = active
	this.browser.sendResponse(seq, true)
}

Session.prototype.evaluateOnCallFrame = function (
	callFrameId,
	expression,
	objectGroup,
	includeCommandLineAPI,
	returnByValue,
	seq) {
	var self = this
	if (seq === undefined) seq = returnByValue
	this.client.evaluate(expression, callFrameId, function (err, body) {
		if (err) {
			self.browser.sendResponse(seq, true, {
				result: { type: 'error', description: err },
				isException: false
			})
		}
		else {
			self.browser.sendResponse(seq, true, {
				result: v2w.refToObject(body),
				isException: false
			})
		}
	})
}

Session.prototype.evaluate = function (
	expression,
	objectGroup,
	includeCommandLineAPI,
	doNotPauseOnExceptions,
	seq) {
	var self = this
	if (seq === undefined) seq = doNotPauseOnExceptions
	this.client.evaluate(expression, null, function (err, body) {
		if (err) {
			self.browser.sendResponse(seq, true, {
				result: { type: 'error', description: err},
				isException: false
			})
		}
		else {
			self.browser.sendResponse(seq, true, {
				result: v2w.refToObject(body),
				isException: false
			})
		}
	})
}

Session.prototype.getProperties = function (objectId, ownProperties, seq) {
	var self = this
	var tokens = objectId.split(':')
	var frame = +(tokens[0])
	var scope = +(tokens[1])
	var ref = tokens[2]
	if (ref === 'backtrace') {
		this.client.scope(scope, frame,
			function (err, msg) {
				if (msg.success) {
					var refs = {}
					if (msg.refs && Array.isArray(msg.refs)) {
						msg.refs.forEach(function (r) {
							refs[r.handle] = r
						})
					}
					var props = msg.body.object.properties.map(
						function (p) {
							var r = refs[p.value.ref]
							return {
								name: p.name,
								value: v2w.refToObject(r)
							}
						}
					)
					self.browser.sendResponse(seq, true, { result: props })
				}
			}
		)
	}
	else {
		var handle = +ref
		this.client.lookup([handle],
			function (err, msg) {
				if (msg.success) {
					var refs = {}
					var props = []
					if (msg.refs && Array.isArray(msg.refs)) {
						var obj = msg.body[handle]
						var objProps = obj.properties
						var proto = obj.protoObject
						msg.refs.forEach(function (r) {
							refs[r.handle] = r
						})
						props = objProps.map(function (p) {
							var r = refs[p.ref]
							return {
								name: '' + p.name,
								value: v2w.refToObject(r)
							}
						})
						if (proto) {
							props.push({
								name: '__proto__',
								value: v2w.refToObject(refs[proto.ref])
							})
						}
					}
					self.browser.sendResponse(seq, true, { result: props })
				}
			}
		)
	}
}

Session.prototype.enable = function (seq) {
	this.browser.sendResponse(seq, true)
}

Session.prototype.close = nop

Session.prototype.attach = function () {
	var self = this
	this.client.connect(this.debugPort)
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
}

Session.prototype.join = function (ws) {
	this.browser = new Browser(ws, this)
	this.browserConnectedFlow()
}

// flows

Session.prototype.getBacktraceFlow = function () {
	var self = this
	this.client.backtrace(function (err, body) {
		self.browser.sendEvent('Debugger.paused', { details: { callFrames: v2w.callFrames(body.frames)}})
	})
}

Session.prototype.evaluateFlow = nop

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
			self.browser.sendEvent('Debugger.debuggerWasEnabled')
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
		var item = {
			path: s.url,
			url: s.url
		}
		self.browser.sendEvent('Debugger.scriptParsed', s)
	})
}

Session.prototype.breakEventFlow = function (msg) {
	if (this.breakpointsActive) {
		this.getBacktraceFlow()
	}
	else {
		this.resume()
	}
}

module.exports = Session
