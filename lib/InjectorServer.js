/**
* @param {Array} injections
* @param {Array} options
*/
function injectorServer(options) {
  var nextHandleId = 0;

  var debug = require(options['v8-debug']);
  var makeMirrorSerializer = debug.get('MakeMirrorSerializer');

  global.process._require = require;
  global.process._debugObject = debug;

  debug.serializeAndCacheMirror = function(cache, mirror, response) {
    // Get previously cached mirror if existed
    mirror = resolveCachedMirror(cache, mirror);

    var serializer = makeMirrorSerializer(true);
    var body = serializer.serializeValue(mirror);

    // Current serialization doesn't support internal properties refs
    // Will be fixed after injecting InjectedScript.js
    delete body.internalProperties;

    var refs = {};
    serializer.mirrors_.forEach(function(refMirror) {
      refs[refMirror.handle()] = resolveCachedMirror(cache, refMirror);
    });

    Object.keys(body).forEach(function(key) {
      var prop = body[key];
      checkRefProperty(refs, prop);
    });

    if (response) {
      response.refs = serializer.mirrors_.map(function(refMirror) {
        return debug.serializeAndCacheMirror(cache, refMirror);
      });
    }

    return body;
  };

  function resolveCachedMirror(cache, mirror) {
    var mirrorKey = Object.keys(cache).filter(function(key) {
      var cached = cache[key];

      if (!mirror.value || !cached.value) return false;

      // Special check for NaN as NaN == NaN is false.
      if (mirror.isNumber() && isNaN(mirror.value()) &&
          cached.isNumber() && isNaN(cached.value())) {
        return true;
      }

      return mirror.value() === cached.value();
    })[0];

    if (mirrorKey === undefined) {
      mirrorKey = mirror.handle_ = nextHandleId++;
      cache[mirrorKey] = mirror;
    }

    return cache[mirrorKey];
  }

  function checkRefProperty(refs, prop) {
    if (typeof prop != 'object') return;

    if (prop.length)
      prop.forEach(checkRefProperty.bind(null, refs));
    else if (prop.ref !== undefined)
      prop.ref = refs[prop.ref].handle();
  }
}

module.exports = injectorServer;
