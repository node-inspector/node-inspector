/*
 * Copyright (C) 2009 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

if (!window.InspectorFrontendHost) {

//FIXME temporary hack for the taskbar color
WebInspector._platformFlavor = WebInspector.PlatformFlavor.MacTiger;

WebInspector.InspectorFrontendHostStub = function()
{
  this._attachedWindowHeight = 0;
  this.showContextMenu = function(event, items) {
    if(chrome && chrome.experimental) {
      chrome.experimental.contextMenus.removeAll();
      items.forEach(function(item) {
        chrome.experimental.contextMenus.create({
          title: item.label,
          onclick: function() {
            WebInspector.contextMenuItemSelected(item.id);
          }
        });
      });
    }
  };
  //TODO find a place for these
  function _valueOf(value) {
    var p = {};
    switch (value.type) {
      case 'object':
        p.value = {
          description: value.className,
          hasChildren: true,
          injectedScriptId: value.ref || value.handle,
          type: 'object'
          };
        break;
      case 'function':
        p.value = {
          description: value.text || 'function()',
          hasChildren: true,
          injectedScriptId: value.ref || value.handle,
          type: 'function'
          };
        break;
      case 'undefined':
        p.value = {description: 'undefined'};
        break;
      case 'null':
        p.value = {description: 'null'};
        break;
      default:
        p.value = {description: value.value};
        break;
    }
    return p;
  };
  
  function _property(prop) {
    var p = _valueOf(prop.value);
    p.name = String(prop.name);
    return p;
  };
  
  function refToProperties(ref) {
    if (ref) {
      return ref.properties.map(_property);
    }
  };
  
  var debugr = WebInspector.nodeDebugger;
  debugr.on('scripts', function(msg) {
    msg.body.forEach(function(s) {
      WebInspector.parsedScriptSource(s.id, s.name, s.source, s.lineOffset, 0);
    });
    if (!msg.running && !WebInspector.panels.scripts._paused) {
      debugr.getBacktrace();
    }
  });
  debugr.on('scope', function(msg) {
    WebInspector.Callback.processCallback(msg.callId, refToProperties(msg.body.object));
  });
  debugr.on('suspend', function(msg) {
    if (msg.success && !msg.running) {
      debugr.getBacktrace();
    }
  });
  debugr.on('lookup', function(msg) {
    var ref = msg.body[Object.keys(msg.body)[0]];
    WebInspector.Callback.processCallback(msg.callId, refToProperties(ref));
  });
  debugr.on('evaluate', function(msg) {
    if (msg.success) {
      WebInspector.Callback.processCallback(msg.callId, _valueOf(msg.body));
    }
    else {
      WebInspector.Callback.processCallback(msg.callId, {value: msg.message, isException: true});
    }
  });
  debugr.on('setbreakpoint', function(msg) {
    if (msg.callId) {
      var a = msg.arguments;
      WebInspector.didSetBreakpoint(msg.callId, true, a.line + 1);
    }
    else {
      // a different window set a breakpoint
      debugr.listBreakpoints();
    }
  });
  debugr.on('clearbreakpoint', function(msg) {
    var bp = WebInspector.breakpointManager._breakpoints[msg.arguments.id];
    if (bp) {
      WebInspector.breakpointManager._removeBreakpoint(bp);
    }
  });
  debugr.on('changebreakpoint', function(msg) {
    if (msg.callId == null) {
      var bp = WebInspector.breakpointManager._breakpoints[msg.arguments.id];
      if (bp) {
        bp._enabled = msg.arguments.enabled;
        if(bp.enabled) {
          bp.dispatchEventToListeners("enabled");
        }
        else {
          bp.dispatchEventToListeners("disabled");
        }
      }
    }
  });
  debugr.on('listbreakpoints', function(msg) {
    WebInspector.breakpointManager.reset();
    msg.body.breakpoints.forEach(function(bp) {
      if(bp.type === 'scriptId') {
        var l = bp.line + 1;
        var url = WebInspector.panels.scripts._sourceIDMap[bp.script_id].sourceURL;
        WebInspector.breakpointManager.setBreakpoint(bp.script_id, url, l, !!bp.active, bp.condition)
      }
    });
  });
  debugr.on('backtrace', function(msg) {
    var callFrames = msg.body.frames.map(function(frame) {
      var f = {
        type: 'function',
        functionName: frame.func.inferredName,
        sourceID: frame.func.scriptId,
        line: frame.line + 1,
        id: frame.index
      };
      f.scopeChain = frame.scopes.map(function(scope) {
        var c = {};
        switch (scope.type) {
          case 0:
            break;
          case 1:
            c.isLocal = true;
            c.thisObject = {description: frame.receiver.className, hasChildren: true, injectedScriptId: frame.receiver.ref};
            c.locals = frame.locals;
            c.arguments = frame.arguments;
            break;
          case 2:
            c.isWithBlock = true;
            break;
          case 3:
            c.isClosure = true;
            break;
          case 4:
            c.isElement = true;
            break;
          default:
            break;
        }
        c.injectedScriptId = {frameId: frame.index, scopeId: scope.index, isLocal: !!c.isLocal};
        return c;
      });
      return f;
    });
    WebInspector.pausedScript(callFrames);
  });
  debugr.on('continue', function(msg) {
    if(WebInspector.panels.scripts._paused) {
      var panel = WebInspector.panels.scripts;
      panel._paused = false;
      panel._waitingToPause = false;
      panel._clearInterface();
    }
  });
  debugr.on('changelive', function(msg) {
    if (msg.callId) {
      WebInspector.didEditScriptSource(msg.callId.id, msg.success, msg.message ||msg.callId.body);
    }
    else {
      WebInspector.panels.scripts.reset();
      WebInspector.nodeDebugger.getScripts();
    }
  });
  debugr.on('frame', function(msg) {
  
  });
  debugr.on('scopes', function(msg) {
  
  });
  debugr.on('source', function(msg) {
  
  });
  debugr.on('version', function(msg) {
  
  });
  debugr.on('profile', function(msg) {
  
  });
  
  // events
  debugr.on('break', function(msg) {
    debugr.getBacktrace();
  });
  debugr.on('exception', function(msg) {
    WebInspector.addConsoleMessage({
      source: WebInspector.ConsoleMessage.MessageSource.JS,
      type: WebInspector.ConsoleMessage.MessageType.Log,
      level: WebInspector.ConsoleMessage.MessageLevel.Error,
      repeatCount: 1,
      message: 'exception: ' + msg.body});
  });
  debugr.on('stdout', function(msg) {
    WebInspector.addConsoleMessage({
      source: WebInspector.ConsoleMessage.MessageSource.JS,
      type: WebInspector.ConsoleMessage.MessageType.Log,
      level: WebInspector.ConsoleMessage.MessageLevel.Log,
      repeatCount: 1,
      message: 'stdout: ' + msg.body});
  });
  debugr.on('stderr', function(msg) {
    WebInspector.addConsoleMessage({
      source: WebInspector.ConsoleMessage.MessageSource.JS,
      type: WebInspector.ConsoleMessage.MessageType.Log,
      level: WebInspector.ConsoleMessage.MessageLevel.Error,
      repeatCount: 1,
      message: 'stderr: ' + msg.body});
  });
}

WebInspector.InspectorFrontendHostStub.prototype = {
  platform: function()
  {
    var match = navigator.userAgent.match(/Windows NT/);
    if (match)
      return "windows";
    match = navigator.userAgent.match(/Mac OS X/);
    if (match)
      return "mac";
    return "linux";
  },

  port: function()
  {
    return "qt";
  },

  bringToFront: function()
  {
    this._windowVisible = true;
  },

  closeWindow: function()
  {
    this._windowVisible = false;
  },

  attach: function()
  {
  },

  detach: function()
  {
  },

  search: function(sourceRow, query)
  {
  },

  setAttachedWindowHeight: function(height)
  {
  },

  moveWindowBy: function(x, y)
  {
  },

  loaded: function()
  {
    Preferences.samplingCPUProfiler = true;
    Preferences.heapProfilerPresent = true;
    Preferences.debuggerAlwaysEnabled = true;
    Preferences.profilerAlwaysEnabled = true;
    Preferences.canEditScriptSource = true;
    document.getElementById("dock-status-bar-item").style.display='none';
    WebInspector.populateApplicationSettings();
    WebInspector.applicationSettings.installSetting("scriptsSidebarWidth", "scripts-sidebar-width", 250);
    WebInspector.applicationSettings.installSetting("consoleSidebarWidth", "console-sidebar-width", 250);    	
    WebInspector.showScriptsPanel();
    WebInspector.panels.scripts._pauseOnExceptionButton.element.style.display = 'none';
    WebInspector.panels.scripts._enableDebugging();
  },

  localizedStringsURL: function()
  {
    return undefined;
  },

  hiddenPanels: function()
  {
    return "elements,resources,timeline,profiles,storage,audits";
  },

  inspectedURLChanged: function(url)
  {
  },

  copyText: function()
  {
  },

  canAttachWindow: function()
  {
    return false;
  }
}

InspectorFrontendHost = new WebInspector.InspectorFrontendHostStub();

}
