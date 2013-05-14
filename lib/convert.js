exports.v8LocationToInspectorLocation = function(v8loc) {
  return {
    scriptId: v8loc.script_id.toString(),
    lineNumber: v8loc.line,
    columnNumber: v8loc.column,
  }
}

exports.v8NameToInspectorUrl = function(v8name) {
  // TODO(bajtos) convert windows paths to file URLs

  if (/^\//.test(v8name)) {
    return 'file://' + v8name;
  }
  return v8name;
}

exports.inspectorUrlToV8Name = function(url) {
  return url.replace(/^file:\/\//, '');
}

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
}

exports.v8RefToInspectorObject = function(ref) {
  var desc = '',
      name;

  switch (ref.type) {
    case 'object':
      name = /#<an?\s(\w+)>/.exec(ref.text);
      if (name && name.length > 1) {
        desc = name[1];
        if (desc === 'Array') {
          desc += '[' + (ref.properties.length - 1) + ']';
        }
        else if (desc === 'Buffer') {
          desc += '[' + (ref.properties.length - 4) + ']';
        }
      }
      else {
        desc = ref.className || 'Object';
      }
      break;
    case 'function':
      desc = ref.text || 'function()';
      break;
    default:
      desc = ref.text || '';
      break;
  }
  if (desc.length > 100) {
    desc = desc.substring(0, 100) + '\u2026';
  }
  return {
    type: ref.type,
    objectId: ref.handle.toString(),
    className: ref.className,
    description: desc,
  };
}
