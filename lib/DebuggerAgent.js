// node-inspector version of on webkit-inspector/DebuggerAgent.cpp

var convert = require('./convert.js');

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

  setOverlayMessage: function(params, done) {
    done();
  },
}

exports.DebuggerAgent = DebuggerAgent;