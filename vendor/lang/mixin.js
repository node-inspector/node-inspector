
module.exports = function Mixin(target, source) {
  if (source) {
    for(var key, keys = Object.keys(source), l = keys.length; l--; ) {
      key = keys[l];
    
      if(source.hasOwnProperty(key)){
        target[key] = source[key];
      }
    }
  }
  return target;
};