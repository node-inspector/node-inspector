var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var v2w = require('../v2w')

function Debugger(client) {
	this.client = client
	this.tempBreakpointId = 0
	this.breakpointsActive = true
}

inherits(Debugger, EventEmitter)

Debugger.prototype.canSetScriptSource = function (params, callback) {
	callback(undefined, { result: false })
}

Debugger.prototype.continueToLocation = function (params, callback) {
	var location = new Location(params.location)
	var self = this

	if (this.tempBreakpointId !== 0) {
		this.client.clearBreakpoint(this.tempBreakpointId, noop)
	}
	this.client.setBreakpoint(location.scriptId
		, location.lineNumber
		, location.columnNumber
		, true
		, null
		,
		function (err, body) {
			if (!err) {
				self.tempBreakpointId = body.breakpoint
			}
			self.resume(null, callback)
		}
	)
}

Debugger.prototype.disable = function (params, callback) {
	callback()
}

Debugger.prototype.enable = function (params, callback) {
	this.emit('enabled')
	callback()
}

Debugger.prototype.evaluateOnCallFrame = function (params, callback) {
	var callFrameId = params.callFrameId
	var expression = params.expression
	var objectGroup = params.objectGroup
	var returnByValue = params.returnByValue

	this.client.evaluate(expression, callFrameId, function (err, body) {
		if (err) {
			callback(err,
				{ result: { type: 'error', description: err }
				, wasThrown: true
				}
			)
		}
		else {
			callback(err, {
				// TODO: result format
				result: v2w.refToObject(body),
				wasThrown: false
			})
		}
	})
}

Debugger.prototype.getScriptSource = function (params, callback) {
	var scriptId = params.scriptId
	this.client.getScriptSource(scriptId, function (err, body) {
		callback(err, { scriptSource: body[0].source })
	})
}

Debugger.prototype.pause = function (params, callback) {
	var self = this
	this.client.suspend(
		function (msg) {
			//TODO
			callback()
			// if (!msg.running) {
			// 	self.getBacktrace()
			// }
		}
	)
}

Debugger.prototype.removeBreakpoint = function (params, callback) {
	var breakpointId = params.breakpointId
	this.client.clearBreakpoint(breakpointId,
		function (err, body) {
			callback(err)
		}
	)
}

Debugger.prototype.resume = function (params, callback) {
	this.client.resume(null, null, callback)
}

Debugger.prototype.searchInContent = function (scriptId, query, caseSensitive, isRegex) {

}

Debugger.prototype.setBreakpoint = function (params, callback) {
	var location = params.location
	var condition = params.condition

	this.client.setBreakpoint(location.scriptId
		, location.lineNumber
		, location.columnNumber
		, true
		, condition
		,
		function (err, body) {
			if (!err) {
				var locations = body.actual_locations.map(
					function (x) {
						return { lineNumber: x.line
						       , columnNumber: x.column
						       , scriptId: x.script_id
						       }
					}
				)
				callback(err, { breakpointId: body.breakpoint + '', actualLocation: locations[0]})
			}
		}
	)
}

Debugger.prototype.setBreakpointByUrl = function (params, callback) {
	var lineNumber = params.lineNumber
	var url = params.url
	var urlRegex = params.urlRegex
	var columnNumber = params.columnNumber
	var condition = params.condition
	this.client.setBreakpointByUrl(lineNumber, url, columnNumber, true, condition,
		function (err, body) {
			var locations = body.actual_locations.map(
				function (x) {
					return { lineNumber: x.line
					       , columnNumber: x.column
					       , scriptId: String(x.script_id)
					       }
				}
			)
			callback(err, { breakpointId: body.breakpoint + '', locations: locations})
		}
	)
}

Debugger.prototype.setBreakpointsActive = function (params, callback) {
	var active = params.active
	this.breakpointsActive = active
	callback()
}

Debugger.prototype.setPauseOnException = function (params, callback) {
	var state = params.state

	switch (state) {
	case 'all':
		this.client.setExceptionBreak('all', true, function (err, body) {
			console.log(body)
		})
		break;
	case 'uncaught':
		this.client.setExceptionBreak('uncaught', true, function (err, body) {
			console.log(body)
		})
		break;
	case 'none':
		this.client.setExceptionBreak('all', false, function (err, body) {
			console.log(body)
		})
		break;
	}
	callback()
}

Debugger.prototype.setScriptSource = function (params, callback) {
	var scriptId = params.scriptId
	var scriptSource = params.scriptSource

	this.client.changeLive(scriptId, scriptSource, false, function (err, body) {
		callback(err, { callFrames: ["TODO"]})
	})
}

Debugger.prototype.stepInto = function (params, callback) {
	this.client.resume('in', 1, callback)
}

Debugger.prototype.stepOut = function (params, callback) {
	//TODO: stepping out of the last frame
	this.client.resume('out', 1, callback)
}

Debugger.prototype.stepOver = function (params, callback) {
	this.client.resume('next', 1, callback)
}

//

Debugger.prototype.breakpointResolved = function (breakpointId, location) {
	this.emit('event', 'Debugger.breakpointResolved', { breakpointId: breakpointId, location: location})
}

Debugger.prototype.globalObjectCleared = function () {
	this.emit('event','Debugger.globalObjectCleared')
}

Debugger.prototype.paused = function (callFrames, reason, data) {
	this.emit('event', 'Debugger.paused', { callFrames: callFrames, reason: reason, data: data})
}

Debugger.prototype.resumed = function () {
	this.emit('event','Debugger.resumed')
}

Debugger.prototype.scriptFailedToParse = function (url, scriptSource, startLine, errorLine, errorMessage) {
	this.emit('event'
		, 'Debugger.scriptFailedToParse'
		,
		{ url: url
		, scriptSource: scriptSource
		, startLine: startLine
		, errorLine: errorLine
		, errorMessage: errorMessage
		}
	)
}

Debugger.prototype.scriptParsed = function (scriptId, url, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapUrl) {
	this.emit('event'
		,'Debugger.scriptParsed'
		,
		{ scriptId: scriptId
		, url: url
		, startLine: startLine
		, startColumn: startColumn
		, endLine: endLine
		, endColumn: endColumn
		, isContentScript: isContentScript
		, sourceMapUrl: sourceMapUrl
		}
	)
}

module.exports = Debugger
