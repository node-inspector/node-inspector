var events = require('events'),
    debugr = require('./debugger');

///////////////////////////////////////////////////////////
// exports

exports.create = function(debuggerPort, config) {
  var debug = null,
      conn = null,
      //map from sourceID to filename
      sourceIDs = {},
      //milliseconds to wait for a lookup
      LOOKUP_TIMEOUT = 2500,
      //node function wrapper
      FUNC_WRAP = /^\(function \(exports, require, module, __filename, __dirname\) \{ ([\s\S]*)\n\}\);$/,
      //
      cpuProfileCount = 0;

  function wrapperObject(type, desc, frame, scope, ref) {
    return {
      type: type,
      // subtype: 'Foo',
      description: desc,
      objectId: frame + ':' + scope + ':' + ref
    };
  }

  function refToObject(ref) {
    var desc = '',
        value,
        name;
    switch (ref.type) {
      case 'object':
        name = /#<an?\s(\w+)>/.exec(ref.text);
        if (name && name.length > 1) {
          desc = name[1];
          if (desc === 'Array') {
            desc += '[' + (ref.properties.length - 1) + ']';
          }
          else if (desc === 'Buffer') {
            desc += '[' + (ref.properties.length - 4) + ']';
          }
        }
        else {
          desc = ref.className || 'Object';
        }
        break;
      case 'function':
        desc = ref.text || 'function()';
        break;
      default:
        return {
          type: ref.type,
          value: ref.value || ref.text
        };
    }
    return wrapperObject(ref.type, desc, 0, 0, ref.handle);
  }

  function callFrames(frames) {
    if (frames && frames.length > 0) {
      return frames.map(function(frame) {
        var f = {
          type: 'function',
          functionName: frame.func.inferredName,
          index: frame.index,
          id: frame.index + '',
          location: {
            scriptId: frame.func.scriptId,
            lineNumber: frame.line
          }
        };
        f.scopeChain = frame.scopes.map(
              function(scope) {
                var c = {};
                switch (scope.type) {
                  case 0:
                    c.type = 'global';
                    break;
                  case 1:
                    c.type = 'local';
                    f.this =
                        wrapperObject(
                        'object',
                        frame.receiver.className,
                        frame.index,
                        scope.index,
                        frame.receiver.ref);
                    break;
                  case 2:
                    c.type = 'with';
                    break;
                  case 3:
                    c.type = 'closure';
                    break;
                  case 4:
                    c.type = 'catch';
                    break;
                  default:
                    break;
                }
                //c.objectId = frame.index + ':' + scope.index + ':backtrace';
                // TODO: see if we can get more data from 'scopes' so we don't have to use 'scope' 
                c.object = { description: 'foo', objectId: frame.index + ':' + scope.index + ':backtrace' };
                return c;
              });
        return f;
      });
    }
    return [{
      type: 'program',
      sourceID: 'internal',
      line: 0,
      id: 0,
      worldId: 1,
      scopeChain: []}];
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
    debug.request(
        'backtrace',
        {arguments: { inlineRefs: true }},
        function(msg) {
          sendEvent(
              'Debugger.paused',
              { details: { callFrames: callFrames(msg.body.frames) }});
        });
  }

  function breakEvent(obj) {
    var data = {},
        source = sourceIDs[obj.body.script.id],
        args;
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

  function parsedScripts(msg) {
    var scripts = msg.body.map(function(s) {
      return {
        scriptId: String(s.id),
        url: s.name,
        data: s.source,
        startLine: s.lineOffset,
        startColumn: s.columnOffset,
        endLine: s.lineCount,
        endColumn: 0,
        isContentScript: true
      };
    });

    scripts.forEach(function(s) {
      var hidden = config.hidden &&
                   config.hidden.some(function(r) { return r.test(s.url); }),
          item = { hidden: hidden, path: s.url };
      item.url = s.url;
      sourceIDs[s.scriptId] = item;
      if (!hidden) {
        sendEvent('Debugger.scriptParsed', s);
      }
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

  function sendEvent(name, data) {
    data = data || {};
    if (conn) {
      console.log('\033[35m' + name + '\033[39m : ' + '\033[34m' + JSON.stringify(data) + '\033[39m')
      conn.send(JSON.stringify({
        type: 'event',
        method: name,
        params: data
      }));
    }
  }

  function sendResponse(seq, success, data) {
    data = data || {};
    if (conn) {
      console.log('\033[35m' + seq + '\033[39m : ' + '\033[33m' + JSON.stringify(data) + '\033[39m\n')
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
    sendEvent('Debugger.debuggerWasEnabled');
    sendPing();
    var args = { arguments: { types: 4 }};
    debug.request('scripts', args, function(msg) {
      parsedScripts(msg);
      // debug.request('listbreakpoints', {},
      //   function(msg) {
      //     msg.body.breakpoints.forEach(function(bp) {
      //       var data;
      //       if (bp.type === 'scriptId') {
      //         data = {
      //           sourceID: bp.script_id,
      //           url: sourceIDs[bp.script_id].url,
      //           line: bp.line + 1,
      //           enabled: bp.active,
      //           condition: bp.condition,
      //           number: bp.number
      //         };
      //         breakpoints[bp.script_id + ':' + (bp.line + 1)] = data;
      //         sendEvent('restoredBreakpoint', data);
      //       }
      //     });
      //     if (!msg.running) {
      //       sendBacktrace();
      //     }
      //   });
    });
  }

  return Object.create(events.EventEmitter.prototype, {
    attach: {
      value: function()
      {
        var self = this;
        debug = debugr.attachDebugger(debuggerPort);
        debug.on('break', breakEvent);
        debug.on('close', function() {
          //TODO determine proper close behavior
          debug = {
            request: function() {
              console.error('debugger not connected');
            }
          };
          sendEvent('Debugger.debuggerWasDisabled');
          self.close();
        });
        debug.on('connect', function() {
          browserConnected();
        });
        debug.on('exception', function(msg) {
          breakEvent(msg);
        });
        debug.on('error', function(e) {
          sendEvent('showPanel', { name: 'console' });
          var err = e.toString(), data;
          if (err.match(/ECONNREFUSED/)) {
            err += '\nIs node running with --debug port ' + debuggerPort + '?';
          }
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
        });
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
    enableDebugger: {
      value: function(always) {
        this.attach();
      }
    },
    getProperties: {
      value: function(objectId, ownProperties, id) {
          var tokens = objectId.split(':'),
              frame = +(tokens[0]),
              scope = +(tokens[1]),
              ref = tokens[2];
          if (ref === 'backtrace') {
              debug.request(
                'scope',
                {
                  arguments:
                      {
                        number: scope,
                        frameNumber: frame,
                        inlineRefs: true
                      }
                },
                function(msg) {
                  if (msg.success) {
                    var refs = {};
                    if (msg.refs && Array.isArray(msg.refs)) {
                      msg.refs.forEach(function(r) {
                        refs[r.handle] = r;
                      });
                    }
                    var props = msg.body.object.properties.map(function(p) {
                      var r = refs[p.value.ref];
                      return {
                        name: p.name,
                        value: refToObject(r)
                      };
                    });
                    sendResponse(id, true, { result: props });
                  }
                });
          }
          else {
            var handle = +ref;
            var timeout = setTimeout(function() {
              sendResponse(
                  id,
                  true,
                  { result: [{
                    name: 'sorry',
                    value: wrapperObject(
                        'string',
                        'lookup timed out',
                        0, 0, 0)
                  }]});
              id = 0;
            }, LOOKUP_TIMEOUT);
            debug.request(
                'lookup',
                {
                  arguments:
                      {
                        handles: [handle],
                        includeSource: false
                      }
                },
                function(msg) {
                  clearTimeout(timeout);
                  //TODO break out commonality with above
                  if (msg.success && id !== 0) {
                    var refs = {};
                    var props = [];
                    if (msg.refs && Array.isArray(msg.refs)) {
                      var obj = msg.body[handle];
                      var objProps = obj.properties;
                      var proto = obj.protoObject;
                      msg.refs.forEach(function(r) {
                        refs[r.handle] = r;
                      });
                      props = objProps.map(function(p) {
                        var r = refs[p.ref];
                        return {
                          name: String(p.name),
                          value: refToObject(r)
                        };
                      });
                      if (proto) {
                        props.push({
                          name: '__proto__',
                          value: refToObject(refs[proto.ref])});
                      }
                    }
                    sendResponse(id, true, { result: props });
                  }
                });
          }
      }
    },
    evaluateOnCallFrame: {
      value: function(
        callFrameId,
        expression,
        objectGroup,
        includeCommandLineAPI,
        returnByValue,
        id) {
          if (id === undefined) id = returnByValue;
          evaluate(expression, callFrameId, function(msg) {
            if (msg.success) {
              sendResponse(
                  id,
                  true,
                  {
                    result: refToObject(msg.body),
                    isException: false
                  });
            }
            else {
              sendResponse(
                  id,
                  true,
                  {
                    result:
                        {
                          type: 'error',
                          description: msg.message
                        },
                    isException: false
                  });
            }
        });
      }
    },
    dispatchOnInjectedScript: {
      value: function(injectedScriptId, methodName, argString, seq) {
        var args = JSON.parse(argString);
        if (methodName === 'getProperties') {
          var objectId = args[0];
          var tokens = objectId.split(':');

          var frame = parseInt(tokens[0], 10);
          var scope = parseInt(tokens[1], 10);
          var ref = tokens[2];

          if (ref === 'backtrace') {

          }
          else {
            
          }
        }
        else if (methodName === 'getCompletions') {
          var expr = args[0];
          var data = {
            result: {},
            isException: false
          };
          // expr looks to be empty "" a lot so skip evaluate
          if (expr === '') {
            sendResponse(seq, true, data);
            return;
          }
          evaluate(expr, args[2], function(msg) {
            if (msg.success &&
                msg.body.properties &&
                msg.body.properties.length < 256) {

              msg.body.properties.forEach(function(p) {
                data.result[p.name] = true;
              });
            }
            sendResponse(seq, true, data);
          });

        }
        else {
          var evalResponse = function(msg) {
            if (msg.success) {
              sendResponse(
                  seq,
                  true,
                  {
                    result: refToObject(msg.body),
                    isException: false
                  });
            }
            else {
              sendResponse(
                  seq,
                  true,
                  {
                    result:
                        {
                          type: 'error',
                          description: msg.message
                        },
                    isException: false
                  });
            }
          }
          if (methodName === 'evaluateInCallFrame') {
            evaluate(args[1], args[0], evalResponse);
          }
          else if (methodName === 'evaluate') {
            evaluate(args[0], null, evalResponse);
          }
        }
      }
    },
    disableDebugger: {
      value: function(always) {
        if (debug && debug.connected) {
          debug.close();
        }
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
    clearConsoleMessages: {
      value: function(id) {
        sendEvent('Console.messagesCleared');
      }
    },
    setBreakpoint: {
      value: function(location, condition, seq) {
        var sourceID = location.scriptId,
            lineNumber = location.lineNumber,
            columnNumber = location.columnNumber,
            handleResponse = function(msg) {
              if (msg.success) {
                var b = msg.body,
                    locations = b.actual_locations.map(function(loc) {
                  return {
                    lineNumber: loc.line,
                    columnNumber: loc.column
                  };
                });
                var data = { breakpointId: b.breakpoint + '', locations: locations[0] };
                sendResponse(seq, true, data);
              }
            };
          debug.request(
              'setbreakpoint',
              { arguments: {
                type: 'scriptId',
                target: sourceID,
                line: lineNumber - 1,
                enabled: true,
                condition: condition
              }},
              handleResponse);
      }
    },
    setBreakpointByUrl: {
      value: function (lineNumber, url, columnNumber, condition, id) {
        if (id === undefined) id = condition;
        debug.request(
          'setbreakpoint',
          { arguments: {
            type: 'script',
            target: url,
            line: lineNumber - 1,
            column: columnNumber,
            enabled: true,
            condition: condition
          }},
          function(msg){
            var b = msg.body,
                locations = b.actual_locations.map(function(l){
              return { lineNumber: l.line, columnNumber: l.column };
            });
            sendResponse(
              id,
              true,
              { breakpointId: b.breakpoint + '', locations: locations });
          });
      }
    },
    removeBreakpoint: {
      value: function(breakpointId, id) {
        debug.request(
            'clearbreakpoint',
            { arguments: { breakpoint: +breakpointId }},
            function(msg) {
              if (msg.success) {
                sendResponse(id, true);
              }
            });
      }
    },
    pause: {
      value: function() {
        debug.request('suspend', {}, function(msg) {
          if (!msg.running) {
            sendBacktrace();
          }
        });
      }
    },
    resume: {
      value: function() {
        debug.request('continue');
        sendEvent('Debugger.resumed');
      }
    },
    stepOver: {
      value: function() {
        debug.request('continue', { arguments: {stepaction: 'next'}});
        sendEvent('Debugger.resumed');
      }
    },
    stepInto: {
      value: function() {
        debug.request('continue', { arguments: {stepaction: 'in'}});
        sendEvent('Debugger.resumed');
      }
    },
    stepOut: {
      value: function() {
        debug.request('continue', { arguments: {stepaction: 'out'}});
        sendEvent('Debugger.resumed');
      }
    },
    continueToLocation: {
      value: function(location, id) {
        console.log(location);
      }
    },
    setPauseOnExceptions: {
      value: function(state, seq) {
        var params = {
          arguments: {
            flags: [{
              name: 'breakOnCaughtException',
              value: state !== 'none'}]
          }
        };
        debug.request('flags', params, function(msg) {
          var value = 0;
          if (msg.success) {
            if (msg.body.flags.some(function(x) {
              return x.name === 'breakOnCaughtException' && x.value})) {
              value = 1;
            }
            sendResponse(seq, true, {});
          }
        });
      }
    },
    setScriptSource: {
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
                if (match && sourceIDs[sourceID] && sourceIDs[sourceID].path) {
                  newSource = match[1];
                  fs.writeFile(sourceIDs[sourceID].path, newSource, function(e) {
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
      value: function(sourceID, seq) {
        var args = {
          arguments: {
            includeSource: true,
            types: 4,
            ids: [sourceID] }};
        debug.request('scripts', args, function(msg) {
          sendResponse(seq, msg.success, { scriptSource: msg.body[0].source });
        });
      }
    },
    join: {
      value: function(ws_connection) {
        var self = this;
        conn = ws_connection;
        conn.on('message', function(data) {
          self.handleRequest(data);
        });
        conn.on('disconnect', function() {
          // TODO what to do here? set timeout to close debugger connection
          self.emit('ws_closed');
          conn = null;
        });
        browserConnected();
      }
    },
    handleRequest: {
      value: function(data) {
        console.log('\033[32m' + data + '\033[39m' + '\n');
        var msg = JSON.parse(data),
            command = this[msg.method.split('.')[1]],
            args;
        if (typeof command == 'function') {
          args = !msg.params ? [] : Object.keys(msg.params).map(function(x) {
            return msg.params[x];
          });
          if (msg.id > 0) {
            args.push(msg.id);
          }
          command.apply(this, args);
        }
      }
    }
  });
};
