exports.v8LocationToInspectorLocation = function(v8loc) {
  return {
    scriptId: v8loc.script_id.toString(),
    lineNumber: v8loc.line,
    columnNumber: v8loc.column
  };
};


// Conversions between v8 file paths and node-inspector urls
// Kind      Path            Url
// UNIX      /dir/app.js     file:///dir/app.js
// Windows   c:\dir\app.js   file:///C:/dir/app.js
// UNC       \\SHARE\app.js  file://SHARE/app.js

exports.v8NameToInspectorUrl = function(v8name) {
  if (!v8name || v8name === 'repl') {
    // Call to `evaluate` from user-land creates a new script with undefined URL.
    // REPL has null main script file and calls `evaluate` with `repl`
    // as the file name.
    //
    // When we send an empty string as URL, front-end opens the source
    // as VM-only script (named "[VM] {script-id}").
    //
    // The empty name of the main script file is displayed as "(program)".
    return '';
  }

  if (/^\//.test(v8name)) {
    return 'file://' + v8name;
  } else if (/^[a-zA-Z]:\\/.test(v8name)) {
    return 'file:///' + v8name.replace(/\\/g, '/');
  } else if (/^\\\\/.test(v8name)) {
    return 'file://' + v8name.substring(2).replace(/\\/g, '/');
  }

  return v8name;
};

exports.inspectorUrlToV8Name = function(url) {
  var path = url.replace(/^file:\/\//, '');
  if (/^\/[a-zA-Z]:\//.test(path))
    return path.substring(1).replace(/\//g, '\\'); // Windows disk path
  if (/^\//.test(path))
    return path; // UNIX-style
  if (/^file:\/\//.test(url))
    return '\\\\' + path.replace(/\//g, '\\'); // Windows UNC path

  return url;
};

exports.v8ScopeTypeToString = function(v8ScopeType) {
  switch (v8ScopeType) {
    case 0:
      return 'global';
    case 1:
      return 'local';
    case 2:
      return 'with';
    case 3:
      return 'closure';
    case 4:
      return 'catch';
    default:
      return 'unknown';
  }
};

exports.v8RefToInspectorObject = function(ref) {
  var desc = '',
      type = ref.type,
      subtype,
      size,
      name,
      objectId,
      inspectorResult;

  switch (type) {
    case 'object':
      name = /#<(\w+)>/.exec(ref.text);
      if (name && name.length > 1) {
        desc = name[1];
        if (desc === 'Array' || desc === 'Buffer') {
          size = ref.properties.filter(function(p) { return /^\d+$/.test(p.name);}).length;
          desc += '[' + size + ']';
          subtype = 'array';
        }
      } else if (ref.className === 'Date') {
        desc = new Date(ref.value || NaN).toString();
        subtype = 'date';
      } else {
        desc = ref.className || 'Object';
      }
      break;
    case 'regexp':
      type = 'object';
      subtype = 'regexp';
      desc = ref.text || '';
      /*
        We need to collect RegExp flags and append they to description,
        or open issue in NodeJS same as 'RegExp text serialized without flags'
      */
      break;
    case 'function':
      desc = ref.text || 'function()';
      break;
    case 'error':
      type = 'object';
      desc = ref.text || 'Error';
      break;
    default:
      desc = ref.text || '';
      break;
  }
  if (desc.length > 100) {
    desc = desc.substring(0, 100) + '\u2026';
  }

  objectId = ref.handle;
  if (objectId === undefined)
    objectId = ref.ref;

  inspectorResult = {
    type: type,
    subtype: subtype,
    objectId: String(objectId),
    className: ref.className,
    description: desc
  };

  return inspectorResult;
};

exports.v8ObjectToInspectorProperties = function(obj, refs, options) {
  var proto = obj.protoObject,
      props = obj.properties || [],
      ownProperties = options.ownProperties,
      accessorPropertiesOnly = options.accessorPropertiesOnly;

  props = props.map(function(prop) {
    var ref = refs[prop.ref];
    var inspectorProperty = {
        name: String(prop.name),
        writable: !(prop.attributes & 1 << 0),
        enumerable: !(prop.attributes & 1 << 1),
        configurable: !(prop.attributes & 1 << 2),
        value: exports.v8ResultToInspectorResult(ref)
      };
    return inspectorProperty;
  });

  if (ownProperties && proto) {
    proto = refs[proto.ref];
    if (proto.type !== 'undefined') {
      props.push({
        name: '__proto__',
        value: exports.v8RefToInspectorObject(proto),
        writable: true,
        configurable: true,
        enumerable: false,
        isOwn: true
      });
    }
  }

  props = props.filter(function(prop) {
  /*
    Node.js does not return get/set property descriptors now (v0.11.11),
      therefore we can't fully implement 'accessorPropertiesOnly'.
    See https://github.com/joyent/node/issues/7139
  */
    var isAccessorProperty = ('get' in prop || 'set' in prop);

    return accessorPropertiesOnly ? isAccessorProperty : !isAccessorProperty;
  });

  return props;
};

exports.v8ErrorToInspectorError = function(message) {
  var nameMatch = /^([^:]+):/.exec(message);

  return {
    type: 'object',
    objectId: 'ERROR',
    className: nameMatch ? nameMatch[1] : 'Error',
    description: message
  };
};

exports.v8ResultToInspectorResult = function(result) {
  var subtype,
      inspectorResult;
  if (['object', 'function', 'regexp', 'error'].indexOf(result.type) > -1) {
    return exports.v8RefToInspectorObject(result);
  }

  if (result.type == 'null') {
    // workaround for the problem with front-end's setVariableValue
    // implementation not preserving null type
    result.value = null;
    subtype = 'null';
  }

  inspectorResult = {
    type: result.type,
    subtype: subtype,
    value: result.value,
    description: String(result.value)
  };

  return inspectorResult;
};

exports.inspectorValueToV8Value = function(value) {
  if (value.value === undefined && value.objectId === undefined)
    return { type: 'undefined' };
  if (value.objectId) {
    return { handle: Number(value.objectId) };
  }
  return value;
};

exports.v8FunctionLookupToFunctionDetails = function(handleData) {
  return {
    details: {
      location: {
        scriptId: String(handleData.scriptId),
        lineNumber: handleData.line,
        columnNumber: handleData.column
      },
      name: handleData.name || handleData.inferredName,

      // There is a list of scope ids in responseBody.scopes, but not scope
      // details :( // We need to issue `scopes` request to fetch scopes
      // details, but we don't have frame number where the function was defined.
      // Let's leave the scopeChain empty for now.
      scopeChain: []
    }
  };
};

exports.v8ScriptIdToInspectorId = function(scriptId) {
  return String(scriptId);
};

exports.inspectorScriptIdToV8Id = function(scriptId) {
  return Number(scriptId);
};
