// Wire up websocket to talk to backend
WebInspector.loaded = function() {
  WebInspector.socket = io.connect('http://' + window.location.host + '/');
  WebInspector.socket.on('message', onWebSocketMessage);
  WebInspector.socket.on('error', function(error) { console.error(error); });
  WebInspector.socket.on('connect', onWebSocketConnected);
};

var _inspectorInitialized = false;
function onWebSocketConnected() {
  if (_inspectorInitialized) return;
  InspectorFrontendHost.sendMessageToBackend = WebInspector.socket.send.bind(WebInspector.socket);

  WebInspector.dockController = new WebInspector.DockController();
  WebInspector.doLoadedDone();

  _inspectorInitialized = true;
}

function onWebSocketMessage(message) {
  if (!message) return;

  if (message === 'showConsole') {
    WebInspector.showConsole();
  } else {
    InspectorBackend.dispatch(message);
  }
}

// Disable HTML & CSS inspections
WebInspector.queryParamsObject['isSharedWorker'] = true;

// disable everything besides scripts and console
// that means 'profiles' and 'timeline' at the moment
WebInspector._orig_panelDescriptors = WebInspector._panelDescriptors;
WebInspector._panelDescriptors = function() {
  var panelDescriptors = this._orig_panelDescriptors();
  return panelDescriptors.filter(function(pd) {
    return ['scripts', 'console'].indexOf(pd.name()) != -1;
  });
};

// Patch the expression used as an initial value for a new watch.
// DevTools' value "\n" breaks the debugger protocol.
importScript('WatchExpressionsSidebarPane.js');
WebInspector.WatchExpressionsSection.NewWatchExpression = "''";

Preferences.localizeUI = false;
Preferences.applicationTitle = 'Node Inspector';

WebInspector._platformFlavor = WebInspector.PlatformFlavor.MacLeopard;

// Front-end uses `eval location.href` to get url of inspected page
// This does not work in node.js from obvious reasons, and cause
// a 'null' message to be printed in front-end console.
// Since Preferences.applicationTitle does not include inspected url,
// we can return arbitrary string as inspected URL.
WebInspector.WorkerManager._calculateWorkerInspectorTitle = function() {
  InspectorFrontendHost.inspectedURLChanged('');
};

// Do not offer download of the edited file when saving changes to V8.
// DevTools' implementation changes window.location which closes
// web-socket connection to the server and thus breaks the inspector.
InspectorFrontendHost.close = function(url, content, forceSaveAs) {
  delete this._fileBuffers[url];
};

// Let DevTools know we can save the content of modified files,
// so that a warning icon is not displayed in the file tab header.
// See UISourceCode.hasUnsavedCommittedChanges to understand why.
WebInspector.extensionServer._onSubscribe(
  {
    type:WebInspector.extensionAPI.Events.ResourceContentCommitted
  },
  {
    postMessage: function(msg) {
      // no-op
    }
  }
);

// Front-end intercepts Cmd+R, Ctrl+R and F5 keys and reloads the debugged
// page instead of the front-end page.  We want to disable this behaviour.
WebInspector._orig_documentKeyDown = WebInspector.documentKeyDown;
WebInspector.documentKeyDown = function(event) {
  switch (event.keyIdentifier) {
    case 'U+0052': // R key
    case 'F5':
      return;
  }
  WebInspector._orig_documentKeyDown(event);
};

var orig_createResourceFromFramePayload =
  WebInspector.ResourceTreeModel.prototype._createResourceFromFramePayload;

WebInspector.ResourceTreeModel.prototype._createResourceFromFramePayload =
  function(frame, url, type, mimeType) {
    // Force Script type for all node frames.
    // Front-end assigns Document type (i.e. HTML) to our main script file.
    if (frame._isNodeInspectorScript) {
      type = WebInspector.resourceTypes.Script;
    }

    return orig_createResourceFromFramePayload(frame, url, type, mimeType);
  };

//
// Open the main application file on startup
//

WebInspector.notifications.addEventListener(
  WebInspector.Events.InspectorLoaded,
  function() {
    WebInspector.resourceTreeModel.addEventListener(
      WebInspector.ResourceTreeModel.EventTypes.CachedResourcesLoaded,
      showMainAppFile,
      null
    );
  },
  null
);


function showMainAppFile() {
  var fileTabs = WebInspector.showPanel('scripts')._editorContainer._files;
  if (Object.keys(fileTabs).length > 0){
    // Some files are already opened - do not change user's workspace
    return;
  }

  var uiSourceCodes = getAllUiSourceCodes();
  var uriToShow = WebInspector.inspectedPageURL;

  for (var i in uiSourceCodes) {
    if (uiSourceCodes[i].uri() !== uriToShow) continue;
    WebInspector.showPanel('scripts').showUISourceCode(uiSourceCodes[i]);
    return true;
  }

  console.error('Cannot show the main application file ', uriToShow);
}

function getAllUiSourceCodes() {
  // Based on FilteredItemSectionDialog.js > SelectUISourceCodeDialog()
  var projects = WebInspector.workspace.projects();
  var uiSourceCodes = [];
  var projectFiles;

  for (var i = 0; i < projects.length; ++i) {
    projectFiles = projects[i]
      .uiSourceCodes()
      .filter(function(p) { return p.name(); });
    uiSourceCodes = uiSourceCodes.concat(projectFiles);
  }

  return uiSourceCodes;
}
