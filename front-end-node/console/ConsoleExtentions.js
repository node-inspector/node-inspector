/*jshint browser:true, nonew:false*/
/*global WebInspector:true, InspectorFrontendHost:true, InspectorFrontendHostAPI:true*/
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
