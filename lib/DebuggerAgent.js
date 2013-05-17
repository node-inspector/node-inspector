// node-inspector version of on webkit-inspector/DebuggerAgent.cpp

var convert = require('./convert.js'),
  async = require('async');

function DebuggerAgent(session) {
  this._session = session;
}

DebuggerAgent.prototype = {
  enable: function(params, done) {
    this._session.attach(done);
  },

  disable: function(params, done) {
    this._session.disableDebugger(done);
  },

  resume: function(params, done) {
    this._sendContinue(undefined, done);
  },

  _sendContinue: function(stepAction, done) {
    var args = stepAction ? { stepaction: stepAction } : undefined;
    this._session.sendDebugRequest('continue', args, function(error, result) {
      done(error);
      if (!error)
        this._session.sendInspectorEvent('Debugger.resumed');
    }.bind(this));
  },

  pause: function(params, done) {
    this._session.sendDebugRequest('suspend', {}, function(error, result) {
      done(error);
      if (!error)
        this._session.sendPausedEvent();
    }.bind(this));
  },

  stepOver: function(params, done) {
    this._sendContinue('next', done);
  },

  stepInto: function(params, done) {
    this._sendContinue('in', done);
  },

  stepOut: function(params, done) {
    this._sendContinue('out', done);
  },

  continueToLocation: function(params, done) {
    var requestParams = {
      type: 'scriptId',
      target: parseInt(params.location.scriptId),
      line: params.location.lineNumber,
      column: params.location.columnNumber,
    };

    this._session.sendDebugRequest('setbreakpoint', requestParams, function(error, response) {
      if (error != null) {
        done(error);
        return;
      }

      this._session.continueToLocationBreakpointId = response.breakpoint;
      this._session.sendDebugRequest('continue', undefined, function(error, response) {
        done(error);
      });
    }.bind(this));
  },

  getScriptSource: function(params, done) {
    this._session.getScriptSource(params.scriptId, done);
  },

  setPauseOnExceptions: function(params, done) {
    var requestParams = {
      flags: [
        {
          name: 'breakOnCaughtException',
          value: params.state
        }
      ]
    };
    this._session.sendDebugRequest('flags', requestParams, function(error, response) {
      done(error, null);
    });
  },

  // TODO(bajtos) Keep track of breakpoints - see implementation in session.js

  setBreakpointByUrl: function(params, done) {
    // TODO(bajtos) - handle params.urlRegex
    var requestParams = {
      type: 'script',
      target: convert.inspectorUrlToV8Name(params.url),
      line: params.lineNumber,
      column: params.columnNumber,
      condition: params.condition,
    };

    this._session.sendDebugRequest('setbreakpoint', requestParams, function(error, response) {
      if (error != null) {
        done(error);
        return;
      }

      done(null, {
        breakpointId: response.breakpoint.toString(),
        locations: response.actual_locations.map(convert.v8LocationToInspectorLocation),
      });
    });
  },

  removeBreakpoint: function(params, done) {
    var requestParams = {
      breakpoint: params.breakpointId
    };

    this._session.sendDebugRequest('clearbreakpoint', requestParams, function(error, response) {
      done(error, null);
    });
  },

  setBreakpointsActive: function(params, done) {
    this._session.sendDebugRequest('listbreakpoints', {}, function(error, response) {
      if (error) {
        done(error);
        return;
      }

      function setBreakpointState(bp, next) {
        var req = { breakpoint: bp.number, enabled: params.active };
        this._session.sendDebugRequest('changebreakpoint', req, next);
      }

      async.eachSeries(response.breakpoints, setBreakpointState.bind(this), done);
    }.bind(this));
  },

  setOverlayMessage: function(params, done) {
    done();
  },

  evaluateOnCallFrame: function (params, done) {
    var self = this;
    var expression = params.expression;
    var frame = Number(params.callFrameId);

    self._session.sendDebugRequest(
      'evaluate',
      {
        expression: params.expression,
        frame: frame
      },
      function (err, result) {
        // Errors from V8 are actually just messages, so we need to fill them out a bit.
        if (err) {
          err = convert.v8ErrorToInspectorError(err);
        }

        done(null, {
          result: err || convert.v8ResultToInspectorResult(result),
          wasThrown: !!err
        });
      }
    );
  }
}

exports.DebuggerAgent = DebuggerAgent;
