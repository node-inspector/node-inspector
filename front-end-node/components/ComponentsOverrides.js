/*jshint browser:true, nonew:false*/
/*global WebInspector:true*/

var drawer_proto = WebInspector.Drawer.prototype;
drawer_proto.oldWasShown = drawer_proto.wasShown;
drawer_proto.wasShown = function()
{
    WebInspector.inspectorView.registerRequiredCSS('node/components/ComponentsOverrides.css');
    drawer_proto.wasShown = drawer_proto.oldWasShown;
    drawer_proto.oldWasShown.call(this);
}