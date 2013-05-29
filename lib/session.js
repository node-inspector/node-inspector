var events = require('events'),
    async = require('async'),
    debugr = require('./debugger'),
    convert = require('./convert.js'),
    ScriptManager = require('./ScriptManager').ScriptManager;
    FrontendCommandHandler = require('./FrontendCommandHandler').FrontendCommandHandler,
    CallFramesProvider = require('./CallFramesProvider.js').CallFramesProvider;


///////////////////////////////////////////////////////////
// exports

exports.create = function(debuggerPort, config) {
  var sessionInstance,
      debug = null,
      conn = null,
      attachedToDebugger = false,
      scriptManager = new ScriptManager(config.hidden),
      //node function wrapper
      FUNC_WRAP = /^\(function \(exports, require, module, __filename, __dirname\) \{ ([\s\S]*)\n\}\);$/,
      //
      cpuProfileCount = 0,
      frontendCommandHandler,
      callbackForNextBreak;

  function sendMessageToFrontend(responseObject) {
    if (!conn) {
      console.log('Oops, cannot send response - there is no front-end connection.');
      return;
    }

    conn.send(JSON.stringify(responseObject));
  }

  scriptManager.on('scriptLoaded', function onScriptLoaded(script) {
    sendEvent('Debugger.scriptParsed', script);
  });

  function evaluate(expr, frame, andThen) {
    var args = {
      expression: expr,
      disable_break: true,
      global: true,
      maxStringLength: 100000
    };
    if (frame != null) {
      args.frame = frame;
      args.global = false;
    }
    debug.request(
        'evaluate',
        { arguments: args},
        andThen);
  }

  function sendBacktrace(exception) {
    sessionInstance.fetchCallFrames(function(error, result) {
      if (error)
        sendLogToConsole('error', error);
      else
        sendEvent(
          'Debugger.paused',
          {
            callFrames: result,
            reason: exception ? 'exception' : 'other',
            data: exception ? convert.v8RefToInspectorObject(exception) : null
          });
    });
  }

  function breakEvent(obj) {
    var scriptId = obj.body.script.id,
        source = scriptManager.findScriptByID(scriptId);

    if (source.hidden) {
      debug.sendDebugRequest('continue', { stepaction: 'out' });
      return;
    }

    if (sessionInstance.callbackForNextBreak) {
      var callback = sessionInstance.callbackForNextBreak;
      sessionInstance.callbackForNextBreak = null;
      callback(obj.body);
      return;
    }

    if (sessionInstance.continueToLocationBreakpointId !== null) {
      debug.sendDebugRequest(
        'clearbreakpoint',
        { breakpoint: sessionInstance.continueToLocationBreakpointId },
        function(err, result) {
          if (err)
            sendLogToConsole('warning', err);
          else
            sessionInstance.continueToLocationBreakpointId = null;
        }
      );
    }

    sendBacktrace(obj.body.exception);
  }

  function onAfterCompile(event) {
    if (!event.success) return;
    scriptManager.addScript(event.body.script);
  }

  function sendProfileHeader(title, uid, type) {
    sendEvent('addProfileHeader', {
      header: {
        title: title,
        uid: uid,
        typeId: type
      }});
  }

  function sendLogToConsole(level, text) {
    conn.send('showConsole');
    sendEvent('Console.messageAdded', {
      message: {
        source: 3,
        type: 0,
        level: level,
        line: 0,
        url: '',
        groupLevel: 7,
        repeatCount: 1,
        text: text
      }
    });
  }

  function sendEvent(name, data) {
    data = data || {};
    if (conn) {
      conn.send(JSON.stringify({
        method: name,
        params: data
      }));
    }
  }

  function sendResponse(seq, success, data) {
    data = data || {};
    if (conn) {
      conn.send(JSON.stringify({
        id: seq,
        success: success,
        result: data
      }));
    }
  }

  function sendPing() {
    if (conn) {
      conn.send('ping');
      setTimeout(sendPing, 30000);
    }
  }

  function removeAllBreakpoints(done) {
    debug.sendDebugRequest('listbreakpoints', {}, function(error, response) {
      if (error) {
        console.log('Warning: cannot remove old breakpoints. %s', error);
        done();
        return;
      }

      function removeOneBreakpoint(bp, next) {
        var req = { breakpoint: bp.number };
        debug.sendDebugRequest('clearbreakpoint', req, function(error) {
          if (error)
            console.log(
              'Warning: cannot remove old breakpoint %d. %s',
              bp.number,
              error);
          next();
        });
      }

      async.eachSeries(response.breakpoints, removeOneBreakpoint, done);
    }.bind(this));
  }

  function reloadScripts(done) {
    scriptManager.reset();
    debug.sendDebugRequest(
      'scripts',
      {
        includeSource: false,
        types: 4
      },
      function handleScriptsResponse(err, result) {
        if (err) {
          done(err);
          return;
        }

        result.forEach(scriptManager.addScript.bind(scriptManager));
        done();
      });
  }

  function sendBacktraceIfPaused() {
    if (!debug.isRunning) {
      sendBacktrace();
    }
  }

  function browserConnected() { // TODO find a better name
    sendPing();

    async.waterfall([
      // Remove all existing breakpoints because:
      // 1) front-end inspector cannot restore breakpoints from debugger anyway
      // 2) all breakpoints were disabled when the previous debugger-client
      //    disconnected from the debugged application
      removeAllBreakpoints,
      reloadScripts,
      sendBacktraceIfPaused
    ]);
  }

  sessionInstance = Object.create(events.EventEmitter.prototype, {
    continueToLocationBreakpointId: { writable: true, value: null },
    callbackForNextBreak: {
      get: function() { return callbackForNextBreak; },
      set: function(value) {
        if (value && callbackForNextBreak)
          throw new Error('Cannot set multiple callbacks for the next break.');
        callbackForNextBreak = value;
      }
    },

    sendDebugRequest: {
      value: function(command, args, callback) {
        debug.sendDebugRequest(command, args, callback);
      }
    },

    sendLogToConsole: {
      value: function(level, text) {
        sendLogToConsole(level, text);
      }
    },

    // This method should be removed from session during
    // code cleanup. We should probably extract CallFramesProvider
    // as a dependency for Agents or move this method to debugger client
    fetchCallFrames: {
      value: function(done) {
        new CallFramesProvider(debug).fetchCallFrames(done);
      }
    },

    sendInspectorEvent: {
      value: function(name, data) {
        sendEvent(name, data);
      }
    },

    sendPausedEvent: {
      value: function() {
        sendBacktrace();
      }
    },

    attach: {
      value: function(done)
      {
        var closeReason = 'Debugged process exited.';
        debug = debugr.attachDebugger(debuggerPort);
        debug.on('break', breakEvent);
        debug.on('afterCompile', onAfterCompile);
        debug.on('close', function() {
          //TODO determine proper close behavior
          debug = {
            request: function() {
              console.error('debugger not connected');
            },
            sendDebugRequest: function(command, args, callback) {
              callback('debugger not connected');
            }
          };
          sendEvent('Inspector.detached', { reason: closeReason.replace(/\n/g, '. ') });
          sessionInstance.close();
        });
        debug.on('connect', function() {
          done();
          browserConnected();
        });
        debug.on('exception', function(msg) {
          breakEvent(msg);
        });
        debug.on('error', function(e) {
          var err = e.toString();
          if (err.match(/ECONNREFUSED/)) {
            err += '\nIs node running with --debug port ' + debuggerPort + '?';
            closeReason = err;
          } else if (err.match(/ECONNRESET/)) {
            err += '\nCheck there is no other debugger client attached to port ' + debuggerPort + '.';
            closeReason = err;
          }
          sendLogToConsole('error', err);
        });

        attachedToDebugger = true;
      }
    },
    close: {
      value: function()
      {
        if (debug && debug.connected) {
          debug.close();
        }
        this.emit('close');
      }
    },
    //Controller
    populateScriptObjects: {
      value: function(seq) {
        sendResponse(seq, true, {});
      }
    },
    getInspectorState: {
      value: function(seq) {
        sendResponse(seq, true, {
          state: {
            monitoringXHREnabled: false,
            resourceTrackingEnabled: false
          }});
      }
    },
    getResourceContent: {
      value: function(identifier, encode) {
        // ???
      }
    },
    enableProfiler: {
      value: function(always) {
        if (debug && debug.connected) {
          evaluate('process.profiler !== undefined', null, function(msg) {
            if (msg.body.value) {
              sendEvent('profilerWasEnabled');
            }
            else {
              sendLogToConsole('warning', 'you must require("v8-profiler") to use the profiler');
            }
          });
        }
        else {
          sendLogToConsole('warning', 'not connected to node');
        }
      }
    },
    disableProfiler: {
      value: function(always) {}
    },
    clearConsoleMessages: {
      value: function() {
        sendEvent('consoleMessagesCleared');
      }
    },

    //Profiler
    startProfiling: {
      value: function() {
        /* HACK
         * changed the behavior here since using eval doesn't profile the
         * correct context. Using as a 'refresh' in the mean time
         * Remove this hack once we can trigger a profile in the proper context
         */
        sendEvent('setRecordingProfile', { isProfiling: false });
        this.getProfileHeaders();
      }
    },
    stopProfiling: {
      value: function() {
        evaluate(
            'process.profiler.stopProfiling("org.webkit.profiles.user-initiated.' +
            cpuProfileCount + '")',
            null,
            function(msg) {
              sendEvent('setRecordingProfile', { isProfiling: false });
              if (msg.success) {
                var refs = {};
                profile = {};
                if (msg.refs && Array.isArray(msg.refs)) {
                  var obj = msg.body;
                  var objProps = obj.properties;
                  msg.refs.forEach(function(r) {
                    refs[r.handle] = r;
                  });
                  objProps.forEach(function(p) {
                    profile[String(p.name)] =
                        refToObject(refs[p.ref]).description;
                  });
                }
                sendProfileHeader(parseInt(profile.uid, 10), 'CPU');
              }
            });
      }
    },
    getProfileHeaders: {
      value: function() {
        evaluate('process.profiler.profileCount()', null, function(msg1) {
          var i, count;
          if (msg1.success) {
            for (i = 0, count = msg1.body.value; i < count; i++) {
              evaluate(
                  'process.profiler.getProfile(' + i + ')',
                  null,
                  function(msg) {
                    if (msg.success) {
                      var refs = {};
                      profile = {};
                      if (msg.refs && Array.isArray(msg.refs)) {
                        var obj = msg.body;
                        var objProps = obj.properties;
                        msg.refs.forEach(function(r) {
                          refs[r.handle] = r;
                        });
                        objProps.forEach(function(p) {
                          profile[String(p.name)] =
                              refToObject(refs[p.ref]).description;
                        });
                      }
                      sendProfileHeader(
                          profile.title,
                          parseInt(profile.uid, 10),
                          'CPU');
                    }
                  });
            }
          }
        });
        evaluate('process.profiler.snapshotCount()', null, function(msg1) {
          var i, count;
          if (msg1.success) {
            for (i = 0, count = msg1.body.value; i < count; i++) {
              evaluate(
                  'process.profiler.getSnapshot(' + i + ')',
                  null,
                  function(msg) {
                    if (msg.success) {
                      var refs = {};
                      profile = {};
                      if (msg.refs && Array.isArray(msg.refs)) {
                        var obj = msg.body;
                        var objProps = obj.properties;
                        msg.refs.forEach(function(r) {
                          refs[r.handle] = r;
                        });
                        objProps.forEach(function(p) {
                          profile[String(p.name)] =
                              refToObject(refs[p.ref]).description;
                        });
                      }
                      var title = profile.title === 'undefined' ?
                          'org.webkit.profiles.user-initiated.' + profile.uid :
                          profile.title;
                      sendProfileHeader(
                          title,
                          parseInt(profile.uid, 10),
                          'HEAP');
                    }
                  });
            }
          }
        });
      }
    },
    getProfile: {
      value: function(type, uid, seq) {
        var expr;
        switch (type) {
          case 'HEAP':
            expr = 'process.profiler.findSnapshot(' + uid + ').stringify()';
            break;
          case 'CPU':
            expr = 'process.profiler.findProfile(' + uid + ').stringify()';
            break;
          default:
            break;
        }
        evaluate(expr, null, function(msg) {
          sendResponse(seq, true, {
            profile: {
              title: 'org.webkit.profiles.user-initiated.' + uid,
              uid: uid,
              typeId: type,
              head: JSON.parse(msg.body.value)
            }
          });
        });
      }
    },
    removeProfile: {
      value: function(type, uid) {}
    },
    clearProfiles: {
      value: function() {}
    },
    takeHeapSnapshot: {
      value: function() {
        evaluate('process.profiler.takeSnapshot()', null, function(msg) {
          if (msg.success) {
            var refs = {};
            profile = {};
            if (msg.refs && Array.isArray(msg.refs)) {
              var obj = msg.body;
              var objProps = obj.properties;
              msg.refs.forEach(function(r) {
                refs[r.handle] = r;
              });
              objProps.forEach(function(p) {
                profile[String(p.name)] = refToObject(refs[p.ref]).description;
              });
            }
            sendProfileHeader(
                'org.webkit.profiles.user-initiated.' + profile.uid,
                parseInt(profile.uid, 10),
                'HEAP');
          }
        });
      }
    },
    join: {
      value: function(ws_connection) {
        var self = this;
        conn = ws_connection;
        conn.on('message', function(data) {
          frontendCommandHandler.handleCommand(JSON.parse(data));
        });
        conn.on('disconnect', function() {
          // TODO what to do here? set timeout to close debugger connection
          self.emit('ws_closed');
          conn = null;
        });
      }
    }
  });

  frontendCommandHandler = new FrontendCommandHandler(
    sendMessageToFrontend,
    sessionInstance);

  return sessionInstance;
};
