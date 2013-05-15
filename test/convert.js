var expect = require('chai').expect,
  convert = require('../lib/convert.js');

describe('convert', function() {

  describe('v8NameToInspectorUrl', function() {

    it('preserves node.js internal modules as filename without path', function() {
      expect(convert.v8NameToInspectorUrl('events.js')).to.equal('events.js');
    });

    it('prepends file:// scheme for unix-like paths', function() {
      expect(convert.v8NameToInspectorUrl('/home/user/app.js')).to.equal('file:///home/user/app.js');
    });
  });

  describe('inspectorUrlToV8Name', function() {

    it('returns filename without path for node.js internal modules', function() {
      expect(convert.inspectorUrlToV8Name('events.js')).to.equal('events.js');
    });

    it('removes file:// scheme from full URLs', function() {
      expect(convert.inspectorUrlToV8Name('file:///home/user/app.js')).to.equal('/home/user/app.js');
    });
  });

  describe('v8RefToInspectorObject', function() {
    it('returns type, objectId and className', function() {
      var ref = {
          handle: 1,
          type: 'a-type',
          className: 'a-class-name',
          text: 'a-text'
        },
        obj;

      obj = convert.v8RefToInspectorObject(ref);

      expect(obj.objectId, 'objectId').to.equal('1');
      expect(obj.type, 'type').to.equal('a-type');
      expect(obj.className, 'className').to.equal('a-class-name');
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
        text: '#<MyObject>',
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
          { name: 'parent' },
        ]
      };

      expect(convert.v8RefToInspectorObject(ref).description).to.equal('Buffer[3]');
    });
  });
});