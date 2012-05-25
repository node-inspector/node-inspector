// Wire up websocket to talk to backend
WebInspector.loaded = function() {
  WebInspector.socket = io.connect(
    "http://" + window.location.host + '/'
    ,
    {
      reconnect: false
    }
  )
  WebInspector.socket.on('message'
    ,
    function(message) {
      if (message) {
        InspectorBackend.dispatch(message)
      }
    }
  )
  WebInspector.socket.on('error', function(error) { console.error(error) })
  WebInspector.socket.on('connect'
    ,
    function() {
      InspectorFrontendHost.sendMessageToBackend = WebInspector.socket.send.bind(WebInspector.socket)
      WebInspector.doLoadedDone()
    }
  )
}

// debugger always enabled
Preferences.debuggerAlwaysEnabled = true;
