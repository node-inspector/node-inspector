/*jshint browser:true, nonew:false*/
/*global WebInspector, Runtime, InspectorFrontendHost, InspectorBackendClass*/
WebInspector.NodeInspectorOverrides = function() {
  this._overridenStrings = {
    'Developer Tools - %s': 'Node Inspector - %s',
    '(no domain)': '(core modules)'
  };
  this._overrideMainScriptType();
  this._overrideUIStrings();
  this._overrideWebSocketCreate();

  this._setWorkerTitle();

  this._mergeConnectionQueryParams();

  this._openMainScriptOnStartup();

  this._enableDebuggerUINotifications();
};

WebInspector.NodeInspectorOverrides.prototype = {
  _overrideMainScriptType: function() {
    WebInspector.ResourceTreeModel.prototype.orig_createResourceFromFramePayload =
      WebInspector.ResourceTreeModel.prototype._createResourceFromFramePayload;

    WebInspector.ResourceTreeModel.prototype._createResourceFromFramePayload =
      function(frame, url, type, mimeType) {
        // Force Script type for all node frames.
        // Front-end assigns Document type (i.e. HTML) to our main script file.
        if (frame._isNodeInspectorScript) {
          type = WebInspector.resourceTypes.Script;
        }

        return this.orig_createResourceFromFramePayload(frame, url, type, mimeType);
      };
  },

  _overrideUIStrings: function() {
    var overridenStrings = this._overridenStrings;
    WebInspector.orig_UIString = WebInspector.UIString;
    WebInspector.UIString = function(string, vararg) {
      var args = Array.prototype.slice.call(arguments);
      args[0] = overridenStrings[string] || string;
      return this.orig_UIString.apply(this, args);
    };
  },

  _overrideWebSocketCreate: function() {
    InspectorBackendClass.WebSocketConnection.origCreate =
      InspectorBackendClass.WebSocketConnection.Create;

    InspectorBackendClass.WebSocketConnection.Create = function(url, onConnectionReady) {
      var args = Array.prototype.slice.call(arguments);
      // If front-end is loaded via HTTPS, WebSocket protocol needs to be
      // changed to WSS. Otherwise the browser will block the connection.
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      args[0] = url.replace(/^ws:/, protocol);
      this.origCreate.apply(this, args);
    };
  },

  _setWorkerTitle: function() {
    // Front-end uses `eval location.href` to get url of inspected page
    // This does not work in node.js from obvious reasons, and cause
    // a 'null' message to be printed in front-end console.
    // Since Preferences.applicationTitle does not include inspected url,
    // we can return arbitrary string as inspected URL.
    WebInspector.WorkerTargetManager.prototype._calculateWorkerInspectorTitle = function() {
      InspectorFrontendHost.inspectedURLChanged('');
    };
  },

  _openMainScriptOnStartup: function() {
    WebInspector.targetManager.addModelListener(
      WebInspector.ResourceTreeModel,
      WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded,
      showMainAppFile,
      null
    );
  },

  _mergeConnectionQueryParams: function() {
    var params = Runtime._queryParamsObject;
    if (params['ws'] && params['port']) {
      if (params['ws'].indexOf('?') === -1) {
        params['ws'] += '?';
      } else {
        params['ws'] += '&';
      }
      params['ws'] += 'port=' + params['port'];
    }
  },

  _notifications: [],

  _enableDebuggerUINotifications: function() {
    if (!window.Notification) return;

    function closeAllNotifications() {
      this._notifications.forEach(closeNotification);
      this._notifications = [];
    }

    function clickOnNotification(event) {
      closeNotification(this);
      window.focus();
    }

    function closeNotification(notification) {
      notification.removeEventListener('click', clickOnNotification);
      notification.close();
    }

    Notification.requestPermission(function (permission) {
      if (permission !== 'granted') return;

      WebInspector.targetManager.addModelListener(
        WebInspector.DebuggerModel,
        WebInspector.DebuggerModel.Events.DebuggerPaused,
        processDebuggerPaused,
        this
      );

      window.addEventListener('click', closeAllNotifications.bind(this));
      window.addEventListener('focus', closeAllNotifications.bind(this));
    }.bind(this));

    function setMessageTitle(message, reason, currentFrame) {
      switch (reason) {
        case 'exception':
          message.title = 'Exception caught';
          break;
        default:
          message.title = 'Debugger paused';
          break;
      }
    }

    function setMessageHeader(message, reason, currentFrame) {
      if (!currentFrame) return;

      switch (reason) {
        case 'exception':
          message.header = 'Exception caught';
          break;
        default:
          message.header = 'Breakpoint caught';
          break;
      }
    }

    function setMessageFrameInfo(message, reason, currentFrame) {
      if (!currentFrame) return;

      var lineNumber = currentFrame._location.lineNumber;
      var columnNumber = currentFrame._location.columnNumber;
      var scriptId = currentFrame._location.scriptId;
      var sourceURL = currentFrame._script.sourceURL;
      var sourceMapForId = currentFrame._target._sourceMapForScriptId;

      if (sourceMapForId[scriptId] != null) {
        var sourceMapEntry = sourceMapForId[scriptId].findEntry(lineNumber, columnNumber);
        sourceURL = sourceMapEntry[2];
        lineNumber = sourceMapEntry[3];
        columnNumber = sourceMapEntry[4];
      }

      if (sourceURL) {
        sourceURL = sourceURL.substr(sourceURL.lastIndexOf('/')+1);
      }

      message.frameInfo = ' in module ' +
        (sourceURL || '(' + scriptId + ')') +
        ' at line ' + (lineNumber + 1) +
        ' column ' + columnNumber;
    }

    function processDebuggerPaused(event) {
      if (document.hasFocus()) return;

      var reason = event.data.reason;
      var currentFrame = event.data.callFrames[0];

      var message = {
        title: '',
        header: '',
        frameInfo: ''
      };

      setMessageTitle(message, reason, currentFrame);
      setMessageHeader(message, reason, currentFrame);
      setMessageFrameInfo(message, reason, currentFrame);

      var notification = new Notification(message.title, {
        tag: location.href,
        body: [
          message.header,
          message.frameInfo
        ].join(''),
        icon: 'favicon.ico'
      });

      notification.addEventListener('click', clickOnNotification);

      this._notifications.push(notification);
    }
  }
};

new WebInspector.NodeInspectorOverrides();


function showMainAppFile() {
  WebInspector.inspectorView.showPanel('sources').then(function(panel) {
    var fileTabs = panel._sourcesView._editorContainer._files;

    if (Object.keys(fileTabs).length > 0){
      // Some files are already opened - do not change user's workspace
      return;
    }

    var uiSourceCodes = getAllUiSourceCodes();
    var uriToShow = WebInspector.inspectedPageURL;

    for (var i in uiSourceCodes) {
      if (uiSourceCodes[i].url !== uriToShow) continue;
      panel.showUISourceCode(uiSourceCodes[i]);
      return true;
    }

    console.error('Cannot show the main application file ', uriToShow);
  });
}

function getAllUiSourceCodes() {
  // Based on FilteredItemSectionDialog.js > SelectUISourceCodeDialog()
  var projects = WebInspector.workspace.projects();
  var uiSourceCodes = [];
  var projectFiles;

  for (var i = 0; i < projects.length; ++i) {
    projectFiles = projects[i]
      .uiSourceCodes()
      .filter(nameIsNotEmpty);
    uiSourceCodes = uiSourceCodes.concat(projectFiles);
  }

  return uiSourceCodes;

  function nameIsNotEmpty(p) {
    return p.name();
  }
}
