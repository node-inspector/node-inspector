/*jshint browser:true, nonew:false, proto:true*/
/*global WebInspector:true, InspectorFrontendHost:true, InspectorFrontendHostAPI:true*/
WebInspector.ConsoleViewEventDispatcher = {
  Events: {
    MessageFormatted: 'MessageFormatted'
  },
  __proto__: WebInspector.Object.prototype
};

WebInspector.ConsoleExtensions = function() {
  this._extendConsoleDispatcher();
};

WebInspector.ConsoleExtensions.prototype = {
  _extendConsoleDispatcher: function() {
    WebInspector.ConsoleDispatcher.prototype.showConsole = function() {
      InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.ShowConsole, WebInspector.inspectorView);
    };
  }
};

new WebInspector.ConsoleExtensions();
