/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/
WebInspector.SettingsScreenOverrides = function() {
  this._overrideShowSettingsScreen();
};

WebInspector.SettingsScreenOverrides.prototype = {
  _overrideShowSettingsScreen: function() {
    //Show only shortcuts
    WebInspector.SettingsController.prototype.orig_showSettingsScreen =
      WebInspector.SettingsController.prototype.showSettingsScreen;
    WebInspector.SettingsController.prototype.showSettingsScreen = function() {
      if (!this._settingsScreen)
        this._settingsScreen = new WebInspector.SettingsScreen(this._onHideSettingsScreen.bind(this));
      if (!this._overridenCssRegistered) {
        this._settingsScreen.registerRequiredCSS('node/settings/SettingsScreenOverrides.css');
        this._overridenCssRegistered = true;
      }
      this.orig_showSettingsScreen(WebInspector.SettingsScreen.Tabs.Shortcuts);
    };
  }
};

new WebInspector.SettingsScreenOverrides();
