var expect = require('chai').expect,
  convert = require('../lib/convert.js');

describe('convert', function() {

  describe('v8NameToInspectorUrl', function() {

    it('preserves node.js internal modules as filename without path', function() {
      expect(convert.v8NameToInspectorUrl('events.js')).to.equal('events.js');
    });

    it('converts unix path to file:// URL', function() {
      expect(convert.v8NameToInspectorUrl('/home/user/app.js')).to.equal('file:///home/user/app.js');
    });

    it('converts windows disk path to file:// URL', function() {
      expect(convert.v8NameToInspectorUrl('C:\\Users\\user\\app.js'))
        .to.equal('file:///C:/Users/user/app.js');
    });

    it('converts windows UNC path to file:// URL', function() {
      expect(convert.v8NameToInspectorUrl('\\\\SHARE\\user\\app.js'))
        .to.equal('file://SHARE/user/app.js');
    });

    it('converts undefined path to empty string', function() {
      expect(convert.v8NameToInspectorUrl(undefined))
        .to.equal('');
    });
  });

  describe('inspectorUrlToV8Name', function() {

    it('returns filename without path for node.js internal modules', function() {
      expect(convert.inspectorUrlToV8Name('events.js')).to.equal('events.js');
    });

    it('converts URL to unix path', function() {
      expect(convert.inspectorUrlToV8Name('file:///home/user/app.js')).to.equal('/home/user/app.js');
    });

    it('converts URL to windows disk path', function() {
      expect(convert.inspectorUrlToV8Name('file:///C:/Users/user/app.js'))
        .to.equal('C:\\Users\\user\\app.js');
    });

    it('converts URL to windows UNC', function() {
      expect(convert.inspectorUrlToV8Name('file://SHARE/user/app.js'))
        .to.equal('\\\\SHARE\\user\\app.js');
    });
  });

  describe('v8RefToInspectorObject', function() {
    it('returns type, objectId and className for objects', function() {
      var ref = {
          handle: 1,
          type: 'object',
          className: 'a-class-name',
          text: 'a-text'
        },
        obj;

      obj = convert.v8RefToInspectorObject(ref);

      expect(obj.objectId, 'objectId').to.equal('1');
      expect(obj.type, 'type').to.equal('object');
      expect(obj.className, 'className').to.equal('a-class-name');
    });

    it('returns type, objectId for functions', function() {
      var ref = {
          handle: 1,
          type: 'function',
          className: 'Function',
          text: 'function (a, b) { /*...*/ }'
        },
        obj;

      obj = convert.v8RefToInspectorObject(ref);

      expect(obj.objectId, 'objectId').to.equal('1');
      expect(obj.type, 'type').to.equal('function');
    });

    it('describes string value', function() {
      var aString = 'a-string',
        ref = {
          handle: 0,
          type: 'string',
          value: aString,
          length: aString.length,
          text: aString
        };

      expect(convert.v8RefToInspectorObject(ref).description).to.equal(aString);
    });

    it('describes object type', function() {
      var ref = {
        handle: 0,
        type: 'object',
        className: 'Object',
        text: '#<MyObject>'
      };

      expect(convert.v8RefToInspectorObject(ref).description).to.equal('MyObject');
    });

    it('appends length to Array description', function() {
      var ref = {
        handle: 0,
        type: 'object',
        className: 'Object',
        text: '#<Array>',
        properties: [
          { name: '0' },
          { name: '1' },
          { name: 'length' }
        ]
      };

      expect(convert.v8RefToInspectorObject(ref).description).to.equal('Array[2]');
    });

    it('appends length to Buffer description', function() {
      var ref = {
        handle: 0,
        type: 'object',
        className: 'Object',
        text: '#<Buffer>',
        properties: [
          { name: '0' },
          { name: '1' },
          { name: '3' },
          { name: 'length' },
          { name: 'parent' }
        ]
      };

      expect(convert.v8RefToInspectorObject(ref).description).to.equal('Buffer[3]');
    });
  });
});
