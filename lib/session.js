var events = require('events'),
    debugr = require('./debugger'),
    convert = require('./convert.js'),
    ScriptManager = require('./ScriptManager').ScriptManager;
    Breakpoint = require('./Breakpoint').Breakpoint,
    FrontendCommandHandler = require('./FrontendCommandHandler').FrontendCommandHandler,
    CallFramesProvider = require('./CallFramesProvider.js').CallFramesProvider,
    RuntimeAgent = require('./RuntimeAgent').RuntimeAgent,
    DebuggerAgent = require('./DebuggerAgent').DebuggerAgent;


///////////////////////////////////////////////////////////
// exports

exports.create = function(debuggerPort, config) {
  var sessionInstance,
      debug = null,
      conn = null,
      attachedToDebugger = false,
      //map from sourceID:lineNumber to breakpoint
      breakpoints = {},
      //map for restoring scripts in files not loaded yet
      scriptNameMap = {},
      scriptManager = new ScriptManager(config.hidden),
      //milliseconds to wait for a lookup
      LOOKUP_TIMEOUT = 2500,
      //node function wrapper
      FUNC_WRAP = /^\(function \(exports, require, module, __filename, __dirname\) \{ ([\s\S]*)\n\}\);$/,
      //
      cpuProfileCount = 0,
      frontendCommandHandler;

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

  function wrapperObject(type, description, hasChildren, frame, scope, ref) {
    return {
      type: type,
      description: description,
      hasChildren: hasChildren,
      objectId: frame + ':' + scope + ':' + ref
    };
  }

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

  function sendBacktrace() {
    new CallFramesProvider(debug).fetchCallFrames(function(error, result) {
      if (error)
        sendLogToConsole('error', error);
      else
        sendEvent(
          'Debugger.paused',
          {
            callFrames: result,
            reason: 'other',
            // data: {},
          });
    });
  }

  function breakEvent(obj) {
    var data = {},
        source = scriptManager.findScriptByID(obj.body.script.id),
        args;

    if (sessionInstance.continueToLocationBreakpointId !== null) {
      debug.sendDebugRequest('clearbreakpoint', {breakpoint: sessionInstance.continueToLocationBreakpointId}, function(error, result){
         if (error)
          sendLogToConsole('warning', error);
        else
         sessionInstance.continueToLocationBreakpointId = null;
      });
    }

    if (!source) {
      args = {
        arguments: {
          includeSource: true,
          types: 4,
          ids: [obj.body.script.id]
        }};
      debug.request('scripts', args, parsedScripts);
    }
    else if (source.hidden) {
      debug.request('continue', { arguments: {stepaction: 'out'}});
      return;
    }
    sendBacktrace();
  }

  function onAfterCompile(event) {
    if (!event.success) return;
    scriptManager.addScript(event.body.script);
  }

  function parsedScripts(msg) {
    msg.body.forEach(function(s) {
      scriptManager.addScript(s);
    });
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
    conn.send('showConsolePanel');
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

  function browserConnected() { // TODO find a better name
    sendPing();
    scriptManager.reset();
    var args = { arguments: { includeSource: true, types: 4 }};
    debug.request('scripts', args, function(msg) {
      parsedScripts(msg);
      debug.request('listbreakpoints', {},
        function(msg) {
          msg.body.breakpoints.forEach(function(bp) {
            var data = {
              sourceID: null,
              url: null,
              line: bp.line + 1,
              enabled: bp.active,
              condition: bp.condition,
              number: bp.number
            };

            if (bp.type === 'scriptId') {
              var script = scriptManager.findScriptByID(bp.script_id);
              data.sourceID = bp.script_id;
              data.url = script.url;
              data.sourceName = script.v8name;
            } else if (bp.type == 'scriptName') {
              data.sourceName = bp.script_name;
              if (bp.actual_locations && bp.actual_locations.length > 0) {
                data.sourceID = bp.actual_locations[0].script_id;
                data.url = scriptManager.findScriptByID(data.sourceID).url;
              } else  {
                var rememberedSource = scriptNameMap[bp.script_name];
                if (rememberedSource) {
                  data.url = rememberedSource.url;
                  data.sourceID = rememberedSource.sourceID;
                } else {
                  console.log('Warning: breakpoint in an unknown file "' +
                      bp.script_name + '".');
                  data.url = bp.script_name;
                }
              }
            }

            if (data.sourceID !== null  || data.url !== null) {
              var bpObj = new Breakpoint(data);
              breakpoints[bpObj.key] = bpObj;
              sendEvent('restoredBreakpoint', bpObj);
              // TODO(bajtos) Blink devtools do not support loading breakpoints from debugger
            }
          });
          if (!msg.running) {
            sendBacktrace();
          }
        });
    });
  }

  function listBreakpointsToRestore(breakpointsAlreadySet) {
    var breakpointArray = Object.keys(breakpoints).map(function(k) {
      return breakpoints[k];
    });

    return breakpointArray.filter(function(breakpoint) {
      function sameAsV8Breakpoint(v8data) {
        return breakpoint.sameAs(
            v8data.script_id,
            v8data.line + 1,
            v8data.condition);
      }

      return !breakpointsAlreadySet.some(sameAsV8Breakpoint);
    });
  }

  // TODO(bajtos) Remove this function - front-end is already restoring breakpoints from browser local storage
  function restoreSessionBreakpoints(callback) {
    //if (Object.keys(breakpoints).length < 1) {
      callback();
      return;
    //}

    debug.request('listbreakpoints', {}, function(msg) {
      var breakpointsToRestore = listBreakpointsToRestore(msg.body.breakpoints);

      function restoreNext() {
        if (breakpointsToRestore.length < 1) {
          callback();
          return;
        }

        var bp = breakpointsToRestore.shift();

        if (!bp.sourceName) {
          console.log('Cannot restore breakpoint in sourceID(' +
              bp.sourceID + '):' + bp.line + ' because sourceName was not set.');
          restoreNext();
          return;
        }

        var req = bp.createRequest();
        scriptNameMap[bp.sourceName] = { url: bp.url, sourceID: bp.sourceID };
        debug.request('setbreakpoint', req, restoreNext);
      }

      restoreNext();
    });
  }

  sessionInstance = Object.create(events.EventEmitter.prototype, {
    continueToLocationBreakpointId: { writable:true, value: null },
    sendDebugRequest: {
      value: function(command, args, callback) {
        debug.sendDebugRequest(command, args, callback);
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
        if (attachedToDebugger) {
          // TODO(bajtos) duplicated code - see debug.on('connect')
          done();
          restoreSessionBreakpoints(browserConnected);
          return;
        }
        debug = debugr.attachDebugger(debuggerPort);
        debug.on('break', breakEvent);
        debug.on('afterCompile', onAfterCompile)
        debug.on('close', function() {
          //TODO determine proper close behavior
          debug = {
            request: function() {
              console.error('debugger not connected');
            }
          };
          if (conn)
            conn.send('debuggerWasDisabled');
          // Do not close the session - keep it for debugee restart
          // self.close();
          attachedToDebugger = false;
        });
        debug.on('connect', function() {
          done();
          restoreSessionBreakpoints(browserConnected);
        });
        debug.on('exception', function(msg) {
          breakEvent(msg);
        });
        debug.on('error', function(e) {
          var err = e.toString();
          if (err.match(/ECONNREFUSED/)) {
            err += '\nIs node running with --debug port ' + debuggerPort + '?';
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
    disableDebugger: {
      value: function(done) {
        if (debug && debug.connected) {
          debug.close();
        }
        done();
      }
    },
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
    //Debug
    setBreakpoint: {
      value: function(sourceID, lineNumber, enabled, condition, seq) {
        var bp = breakpoints[sourceID + ':' + lineNumber],
            handleResponse = function(msg) {
              if (msg.success) {
                var b = msg.body;
                var script = scriptManager.findScriptByID(b.script_id);
                var breakpoint =  new Breakpoint({
                  sourceID: b.script_id,
                  sourceName: script.v8name,
                  url: script.url,
                  line: b.line + 1,
                  enabled: enabled,
                  condition: condition,
                  number: b.breakpoint
                });
                breakpoints[breakpoint.key] = breakpoint;
                var data = { success: true, actualLineNumber: b.line + 1 };
                sendResponse(seq, true, data);
              }
            };

        if (bp) {
          debug.request(
              'changebreakpoint',
              { arguments: {
                breakpoint: bp.number,
                enabled: enabled,
                condition: condition
              }},
              function(msg) {
                bp.enabled = enabled;
                bp.condition = condition;
                var data = { success: true, actualLineNumber: lineNumber };
                sendResponse(seq, true, data);
              });
        }
        else {
          debug.request(
              'setbreakpoint',
              { arguments: {
                type: 'scriptId',
                target: sourceID,
                line: lineNumber - 1,
                enabled: enabled,
                condition: condition
              }},
              handleResponse);
        }
      }
    },
    removeBreakpoint: {
      value: function(sourceID, lineNumber) {
        var id = sourceID + ':' + lineNumber;
        debug.request(
            'clearbreakpoint',
            { arguments: { breakpoint: breakpoints[id].number }},
            function(msg) {
              if (msg.success) {
                delete breakpoints[id];
              }
            });
      }
    },
    activateBreakpoints: {
      value: function() {
        Object.keys(breakpoints).forEach(
            function(key) {
              var bp = breakpoints[key];
              debug.request(
                  'changebreakpoint',
                  { arguments: {
                    breakpoint: bp.number,
                    condition: bp.condition,
                    enabled: true
                  }},
                  function(msg) {
                    if (msg.success) {
                      bp.enabled = true;
                      sendEvent('restoredBreakpoint', bp);
                    }
                  });
            });
      }
    },
    deactivateBreakpoints: {
      value: function(injectedScriptId, objectGroup) {
        Object.keys(breakpoints).forEach(
            function(key) {
              var bp = breakpoints[key];
              debug.request(
                  'changebreakpoint',
                  { arguments: {
                    breakpoint: bp.number,
                    condition: bp.condition,
                    enabled: false
                  }},
                  function(msg) {
                    if (msg.success) {
                      bp.enabled = false;
                      sendEvent('restoredBreakpoint', bp);
                    }
                  });
            });
      }
    },
    editScriptSource: {
      value: function(sourceID, newContent, seq) {
        var args = {
          script_id: sourceID,
          preview_only: false,
          new_source: newContent
        };
        debug.request(
            'changelive',
            {arguments: args},
            function(msg) {
              sendResponse(
                  seq,
                  true,
                  {
                    success: msg.success,
                    newBodyOrErrorMessage: msg.message || newContent
                  });
              //TODO: new callframes?
              if (msg.success && config.saveLiveEdit) {
                var fs = require('fs'),
                    match = FUNC_WRAP.exec(newContent),
                    newSource;
                var source = scriptManager.findScriptByID(sourceID);
                if (match && source && source.v8name) {
                  newSource = match[1];
                  fs.writeFile(source.v8name, newSource, function(e) {
                    if (e) {
                      var err = e.toString(),
                          data = {
                            messageObj: {
                              source: 3,
                              type: 0,
                              level: 3,
                              line: 0,
                              url: '',
                              groupLevel: 7,
                              repeatCount: 1,
                              message: err
                            }
                          };
                      sendEvent('addConsoleMessage', data);
                    }
                  });
                }
              }
            });
      }
    },
    getScriptSource: {
      // TODO(bajtos) move to DebuggerAgent
      value: function(sourceID, done) {
        // unobserved / unverified
        var args = {
          arguments: {
            includeSource: true,
            types: 4,
            ids: [sourceID] }
        };
        debug.request('scripts', args, function(msg) {
          if (!msg.success)
            done(msg.message, null);
          else
            done(null, { scriptSource: msg.body[0].source });
        });
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
    },
  });

  frontendCommandHandler = new FrontendCommandHandler(sendMessageToFrontend);
  frontendCommandHandler.registerAgent('Debugger', new DebuggerAgent(sessionInstance));
  frontendCommandHandler.registerAgent('Runtime', new RuntimeAgent(sessionInstance));

  return sessionInstance;
};
