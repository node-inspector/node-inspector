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

    it('appends formatted date to Date description by calling toString on the date', function() {
      var ref = {
        handle: 0,
        type: 'object',
        className: 'Date',
        text: '2013-12-21T15:51:57.635Z',
        value: '2013-12-21T15:51:57.635Z'
      };

      // Ex: "Sat Dec 21 2013 10:51:57 GMT-0500 (EST)", but exact value may vary slightly by platform.
      var datestr = new Date('2013-12-21T15:51:57.635Z').toString();
      var converted = convert.v8RefToInspectorObject(ref);

      expect(converted.description).to.equal(datestr);
      expect(converted.type).to.equal('object');
      expect(converted.subtype).to.equal('date');
    });
  });

  it('Check "Invalid Date" object', function() {
    var ref = {
      handle: 0,
      type: 'object',
      className: 'Date'
    };

    var converted = convert.v8RefToInspectorObject(ref);

    expect(converted.description).to.equal('Invalid Date');
    expect(converted.type).to.equal('object');
    expect(converted.subtype).to.equal('date');
  });

  describe('v8ResultToInspectorResult', function() {
    it('convert regexp as object', function() {
      var v8Result = {
          handle: 0,
          className: 'RegExp',
          type: 'regexp',
          text: '/\/[^a]abc/'
        },
        ref = {
          type: 'object',
          subtype: 'regexp',
          objectId: '0',
          className: 'RegExp',
          description: '/\/[^a]abc/'
        },
        converted = convert.v8ResultToInspectorResult(v8Result);

      expect(converted.type).to.equal(ref.type);
      expect(converted.objectId).to.equal(ref.objectId);
      expect(converted.className).to.equal(ref.className);
      expect(converted.description).to.equal(ref.description);
    });

    it('converts error as object', function() {
      var v8Result = {
        'handle': 6,
        'type': 'error',
        'className': 'Error',
        'constructorFunction': {
          'ref': 47
        },
        'protoObject': {
          'ref': 48
        },
        'prototypeObject': {
          'ref': 2
        },
        'properties': [
          // stack, arguments, type, message
        ],
        'text': 'Error: ENOENT, open \'missing-file\''
      };

      var converted = convert.v8ResultToInspectorResult(v8Result);

      expect(converted).to.eql({
        type: 'object',
        subtype: undefined,
        objectId: '6',
        className: 'Error',
        description: v8Result.text
      });
    });
  });
});
