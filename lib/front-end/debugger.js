function Debugger() {
	this.client = {}
	this.browser = {}
	this.tempBreakpointId = 0
	this.breakpointsActive = true
}

Debugger.prototype.canSetScriptSource = function (params, id) {
	this.browser.sendResponse(id, { result: true })
}

Debugger.prototype.continueToLocation = function (params, id) {
	var location = new Location(params.location)
	var self = this

	if (this.tempBreakpointId !== 0) {
		this.client.clearBreakpoint(this.tempBreakpointId, noop)
	}
	this.client.setBreakpoint(
		location.scriptId,
		location.lineNumber,
		location.columnNumber,
		true,
		null,
		function (err, body) {
			if (!err) {
				self.tempBreakpointId = body.breakpoint
			}
			self.resume(null, id)
		}
	)
}

Debugger.prototype.disable = function () {

}

Debugger.prototype.enable = function () {

}

Debugger.prototype.evaluateOnCallFrame = function (callFrameId, expression, objectGroup, returnByValue) {
	var callFrameId = params.callFrameId
	var expression = params.expression
	var objectGroup = params.objectGroup
	var returnByValue = params.returnByValue
	var self = this

	this.client.evaluate(expression, callFrameId, function (err, body) {
		if (err) {
			self.browser.sendResponse(id, err, {
				result: { type: 'error', description: err },
				wasThrown: true
			})
		}
		else {
			self.browser.sendResponse(id, err, {
				// TODO: result format
				result: v2w.refToObject(body),
				wasThrown: false
			})
		}
	})
}

Debugger.prototype.getScriptSource = function (params, id) {
	var scriptId = params.scriptId
	var self = this
	this.client.getScriptSource(scriptId, function (err, body) {
		self.browser.sendResponse(id, err, { scriptSource: body[0].source })
	})
}

Debugger.prototype.pause = function (params, id) {
	var self = this
	this.client.suspend(
		function (msg) {
			self.browser.sendResponse(id)
			if (!msg.running) {
				self.getBacktrace()
			}
		}
	)
}

Debugger.prototype.removeBreakpoint = function (params, id) {
	var breakpointId = params.breakpointId
	var self = this
	this.client.clearBreakpoint(breakpointId,
		function (err, body) {
			self.browser.sendResponse(id, err)
		}
	)
}

Debugger.prototype.resume = function (params, id) {
	var self = this
	this.client.resume(null, null, function () {
		self.browser.sendResponse(id)
	})
}

Debugger.prototype.searchInContent = function (scriptId, query, caseSensitive, isRegex) {

}

Debugger.prototype.setBreakpoint = function (params, id) {
	var location = params.location
	var condition = params.condition
	var self = this
	this.client.setBreakpoint(location.scriptId, location.lineNumber, location.columnNumber, true, condition,
		function (err, body) {
			if (!err) {
				var locations = body.actual_locations.map(
					function (x) {
						// TODO: scriptId?
						return { lineNumber: x.line, columnNumber: x.column }
					}
				)
				self.browser.sendResponse(id, err, { breakpointId: body.breakpoint + '', actualLocation: locations[0]})
			}
		}
	)
}

Debugger.prototype.setBreakpointByUrl = function (params, id) {
	var lineNumber = params.lineNumber
	var url = params.url
	var urlRegex = params.urlRegex
	var columnNumber = params.columnNumber
	var condition = params.condition
	var self = this
	this.client.setBreakpointByUrl(lineNumber, url, columnNumber, true, condition,
		function (err, body) {
			var locations = body.actual_locations.map(
				function (x) {
					// TODO: scriptId?
					return { lineNumber: x.line, columnNumber: x.column }
				}
			)
			self.browser.sendResponse(id, err, { breakpointId: body.breakpoint + '', locations: locations})
		}
	)
}

Debugger.prototype.setBreakpointsActive = function (params, id) {
	var active = params.active
	this.breakpointsActive = active
	this.browser.sendResponse(id)
}

Debugger.prototype.setPauseOnException = function (params, id) {
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
	this.browser.sendResponse(id)
}

Debugger.prototype.setScriptSource = function (params, id) {
	var scriptId = params.scriptId
	var scriptSource = params.scriptSource
	var self = this

	this.client.changeLive(scriptId, scriptSource, false, function (err, body) {
		self.browser.sendResponse(id, err, { callFrames: ["TODO"]})
	})
}

Debugger.prototype.stepInto = function (params, id) {
	var self = this
	this.client.resume('out', 1, function () {
		self.browser.sendResponse(id)
	})
}

Debugger.prototype.stepOut = function (params, id) {
	var self = this
	this.client.resume('in', 1, function () {
		self.browser.sendResponse(id)
	})
}

Debugger.prototype.stepOver = function (params, id) {
	var self = this
	this.client.resume('next', 1, function () {
		self.browser.sendResponse(id)
	})
}

//

Debugger.prototype.breakpointResolved = function (breakpointId, location) {

}

Debugger.prototype.globalObjectCleared = function () {

}

Debugger.prototype.paused = function (callFrames, reason, data) {

}

Debugger.prototype.resumed = function () {

}

Debugger.prototype.scriptFailedToParse = function (url, scriptSource, startLine, errorLine, errorMessage) {

}

Debugger.prototype.scriptParsed = function (scriptId, url, startLine, startColumn, endLine, endColumn, isContentScript, sourceMapUrl) {

}
