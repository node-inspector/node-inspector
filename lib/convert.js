
exports.v8LocationToInspectorLocation = function(v8loc) {
  return {
    scriptId: v8loc.script_id.toString(),
    lineNumber: v8loc.line,
    columnNumber: v8loc.column,
  }
}

exports.v8NameToInspectorUrl = function (v8name) {
  // TODO(bajtos) convert windows paths to file URLs

  if (/^\//.test(v8name)) {
    return 'file://' + v8name;
  }
  return v8name;
}

exports.inspectorUrlToV8Name = function(url) {
  return url.replace(/^file:\/\//, '');
}
