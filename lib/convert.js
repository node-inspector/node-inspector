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

exports.v8ErrorToInspectorError = function(message) {
  var nameMatch = /^([^:]+):/.exec(message);

  return {
    type: 'object',
    objectId: 'ERROR',
    className: nameMatch ? nameMatch[1] : 'Error',
    description: message
  };
};

exports.inspectorValueToV8Value = function(value) {
  if (value.value === undefined && value.objectId === undefined)
    return { type: 'undefined' };
  if (value.objectId) {
    return { handle: Number(value.objectId) };
  }
  return value;
};
