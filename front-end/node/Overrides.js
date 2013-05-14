
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
  WebInspector._doLoadedDoneWithCapabilities();

  WebInspector.showPanel("scripts");

  _inspectorInitialized = true;
}

function onWebSocketMessage(message) {
  if (!message || message === 'ping') return;

  if (message === 'debuggerWasDisabled') {
    WebInspector.debuggerModel.disableDebugger();
  } else if (message === 'showConsolePanel') {
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

Preferences.localizeUI = false;

WebInspector._platformFlavor = WebInspector.PlatformFlavor.MacLeopard;

