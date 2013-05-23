
// Wire up websocket to talk to backend
WebInspector.loaded = function() {
  WebInspector.socket = io.connect("http://" + window.location.host + '/');
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
  if (!message || message === 'ping') return;

  if (message === 'showConsolePanel') {
    InspectorFrontendAPI.showConsole();
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
}

// Patch the expression used as an initial value for a new watch.
// DevTools' value "\n" breaks the debugger protocol.
importScript("WatchExpressionsSidebarPane.js");
WebInspector.WatchExpressionsSection.NewWatchExpression = "''";

Preferences.localizeUI = false;
Preferences.applicationTitle = 'Node Inspector'

WebInspector._platformFlavor = WebInspector.PlatformFlavor.MacLeopard;

// Front-end uses `eval location.href` to get url of inspected page
// This does not work in node.js from obvious reasons, and cause
// a 'null' message to be printed in front-end console.
// Since Preferences.applicationTitle does not include inspected url,
// we can return arbitrary string as inspected URL.
WebInspector.WorkerManager._calculateWorkerInspectorTitle = function() {
  InspectorFrontendHost.inspectedURLChanged('');
}
