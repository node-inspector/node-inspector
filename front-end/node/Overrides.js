
// Wire up websocket to talk to backend
WebInspector.loaded = function() {
  WebInspector.socket = io.connect("http://" + window.location.host + '/');
  WebInspector.socket.on('message', function(message) {
    if (message && message !== 'ping') {
      WebInspector_syncDispatch(message);
    }
  });
  WebInspector.socket.on('error', function(error) { console.error(error); });
  WebInspector.socket.on('connect', function() {
      InspectorFrontendHost.sendMessageToBackend = WebInspector.socket.send.bind(WebInspector.socket);
      WebInspector.doLoadedDone();
  });
  return;
};

// debugger always enabled
Preferences.debuggerAlwaysEnabled = true;
// enable LiveEdit
Preferences.canEditScriptSource = true;
// enable heap profiler
Preferences.heapProfilerPresent = true;

// patch new watch expression (default crashes node)
WebInspector.WatchExpressionsSection.NewWatchExpression = "''";

// enable ctrl+click for conditional breakpoints
WebInspector.SourceFrame.prototype._mouseDown = function(event)
{
  this._resetHoverTimer();
  this._hidePopup();
  if (event.button != 0 || event.altKey || event.metaKey)
      return;
  var target = event.target.enclosingNodeOrSelfWithClass("webkit-line-number");
  if (!target)
      return;
  var row = target.parentElement;

  var lineNumber = row.lineNumber;

  var breakpoint = this._textModel.getAttribute(lineNumber, "breakpoint");
  if (breakpoint) {
      if (event.shiftKey) {
          breakpoint.enabled = !breakpoint.enabled;
      }
      else if (!event.ctrlKey) {
          breakpoint.remove();
      }
  } else {
      this._addBreakpointDelegate(lineNumber + 1);
      breakpoint = this._textModel.getAttribute(lineNumber, "breakpoint");
  }
  if (breakpoint && event.ctrlKey) {
      this._editBreakpointCondition(breakpoint);
  }
  event.preventDefault();
};

// patch _addScriptToFilesMenu to enable breakpoint marks in scripts
// loaded after the breakpoints were restored
WebInspector.ScriptsPanel.prototype._orig_addScriptToFilesMenu =
    WebInspector.ScriptsPanel.prototype._addScriptToFilesMenu;

WebInspector.ScriptsPanel.prototype._addScriptToFilesMenu =
    function(script, force) {
      this._orig_addScriptToFilesMenu(script, force);

      if (!script.sourceURL && !force)
        return;

      if (script.resource &&
          this._resourceForURLInFilesSelect[script.resource.url])
          return;

      // enable breakpoint marks in scripts loaded later after start
      var self = this;
      WebInspector.breakpointManager
          .breakpointsForURL(script.sourceURL)
          .forEach(function fnAddBreakpoint(breakpoint) {
            self._breakpointAdded({ data: breakpoint });
          });

    }

