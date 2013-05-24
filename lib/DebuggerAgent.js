// node-inspector version of on webkit-inspector/DebuggerAgent.cpp

var convert = require('./convert.js'),
  async = require('async');

function DebuggerAgent(session) {
  this._session = session;
}

DebuggerAgent.prototype = {
  canSetScriptSource: function(params, done) {
    done(null, { result: true });
  },

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
      target: convert.inspectorScriptIdToV8Id(params.location.scriptId),
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

  setScriptSource: function(params, done) {
    this._session.sendDebugRequest(
      'changelive',
      {
        script_id: convert.inspectorScriptIdToV8Id(params.scriptId),
        new_source: params.scriptSource,
        preview_only: false
      },
      function handleChangeLiveResponse(err, response) {
        if (err) {
          done(err);
          return;
        }

        var session = this._session;

        function sendResponse(callframes) {
          done(
            null,
            {
              callFrames: callframes || [],
              result: response.result
            }
          );
        }

        function sendResponseWithCallStack() {
          session.fetchCallFrames(function(err, response) {
            var callframes = [];
            if (err) {
              session.sendLogToConsole(
                'error',
                'Cannot update stack trace after a script changed: ' + err);
            } else {
              callframes = response;
            }
            sendResponse(callframes);
          });
        }

        function stepIntoAndSendResponse() {
          // TODO remove this when front-end supports
          // stack_update_needs_step_in for live-edit
          // See comment in front-end/Script.js > didEditScriptSource()
          session.callbackForNextBreak = function(data) {
            sendResponseWithCallStack();
          };
          session.sendDebugRequest(
            'continue',
            { stepAction: 'in' },
            function(err, response) {
              if (err) {
                session.sendLogToConsole(
                  'error',
                  'Cannot execute step-into after a script changed: ' + err +
                    '\nPlease perform step-into yourself from the GUI.');
                sendResponseWithCallStack();
              }
            }
          );
        }

        if (response.result.stack_update_needs_step_in)
          stepIntoAndSendResponse();
        else if (response.result.stack_modified)
          sendResponseWithCallStack();
        else
          sendResponse();
      }.bind(this)
    )
  },

  setPauseOnExceptions: function(params, done) {
    var args = [
      { type: 'all', enabled: params.state == 'all' },
      { type: 'uncaught', enabled: params.state == 'uncaught' },
    ];

    async.eachSeries(
      args,
      function(arg, next) {
        this._session.sendDebugRequest('setexceptionbreak', arg, next);
      }.bind(this),
      done);
  },

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
  },

  getFunctionDetails: function(params, done) {
    var handle = params.functionId;
    this._session.sendDebugRequest(
      'lookup',
      {
        handles: [ handle ],
        includeSource: false,
      },
      function (error, responseBody) {
        if (error) {
          done(error);
        } else {
          done(null, convert.v8FunctionLookupToFunctionDetails(responseBody[handle]));
        }
      }.bind(this));
  }
}

exports.DebuggerAgent = DebuggerAgent;
