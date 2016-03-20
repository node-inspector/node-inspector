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
  this._overrideFormattedMessage();
};

WebInspector.ConsoleExtensions.prototype = {
  _extendConsoleDispatcher: function() {
    WebInspector.ConsoleDispatcher.prototype.showConsole = function() {
      InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.ShowConsole, WebInspector.inspectorView);
    };
  },
  
  _overrideFormattedMessage: function() {
    WebInspector.ConsoleViewMessage.prototype.formattedMessage = function() {
        if (!this._formattedMessage) {
            this._formatMessage();
            WebInspector.ConsoleViewEventDispatcher.dispatchEventToListeners(
              WebInspector.ConsoleViewEventDispatcher.Events.MessageFormatted,
              this._formattedMessage);
        }
        return this._formattedMessage;
    };
  }
};

new WebInspector.ConsoleExtensions();
