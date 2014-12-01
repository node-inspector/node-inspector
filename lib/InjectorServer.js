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
    //get previously cached mirror if existed
    mirror = resolveCachedMirror(cache, mirror);

    var serializer = makeMirrorSerializer(true);
    var body = serializer.serializeValue(mirror);

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
      return mirror.value && cache[key].value && mirror.value() === cache[key].value();
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
