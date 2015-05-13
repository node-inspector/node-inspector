var expect = require('chai').expect,
    plugins = require('../lib/plugins'),
    InspectorJson = plugins.InspectorJson;

function findEq(collection, option, value) {
  return collection.filter(function(item) {
    return item[option] == value;
  })[0];
}

function clearPlugins() {
  plugins.list.length = 0;
}

function addCommonPlugin() {
  var manifest = {
    name: 'test-plugin',
    type: 'autostart'
  };
  plugins.validateManifest(manifest);
  plugins.list.push(manifest);

  return manifest;
}

describe('Plugins', function() {
  describe('InspectorJson', function() {
    beforeEach(clearPlugins);

    it('works without plugins if `config.plugins` disabled', function() {
      var manifest = addCommonPlugin();
      var inspectorJson = new InspectorJson({ plugins: false });

      expect(findEq(inspectorJson._notes, 'name', 'plugins/' + manifest.name)).to.equal(undefined);
    });

    it('should merge plugins if `config.plugins` enabled', function() {
      var manifest = addCommonPlugin();
      var inspectorJson = new InspectorJson({ plugins: true });

      expect(findEq(inspectorJson._notes, 'name', 'plugins/' + manifest.name)).to.deep.equal({
        name: 'plugins/test-plugin',
        type: 'autostart'
      });
    });

    it('should works correctly with `manifest.exclude`', function() {
      var inspectorJson = new InspectorJson({ plugins: false });

      var excludeTarget = inspectorJson._notes[0];
      var manifest = {
        name: 'test-plugin',
        type: 'autostart',
        exclude: [excludeTarget.name]
      };
      plugins.validateManifest(manifest);
      plugins.list.push(manifest);

      expect(excludeTarget).to.be.instanceof(Object);
      expect(findEq(inspectorJson._notes, 'name', excludeTarget.name)).to.not.equal(undefined);

      inspectorJson = new InspectorJson({ plugins: true });

      expect(findEq(inspectorJson._notes, 'name', excludeTarget.name)).to.equal(undefined);
    });

    it('should correctly stringify itself', function() {
      var manifest = addCommonPlugin();
      var inspectorJson = new InspectorJson({ plugins: true });
      var json = JSON.stringify(inspectorJson),
          object = JSON.parse(json);

      expect(object).to.be.instanceof(Array);
      expect(findEq(object, 'name', 'plugins/' + manifest.name)).to.deep.equal({
        name: 'plugins/' + manifest.name,
        type: 'autostart'
      });
    });
  });
});
