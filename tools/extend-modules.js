var inspector = require('../front-end/inspector.json');

module.exports = function(injections) {
  var result = [];

  injections.forEach(function(item) {
    if (item.type == 'exclude') return;
    
    result.push(item);
  });
  
  inspector.forEach(function(item) {
    var exists = injections.filter(equalTo(item, 'name')).length;
    if (exists) return;
    
    result.push(item);
  });

  return result;
};

function equalTo(target, key) {
  return function(item) {
    return target[key] === item[key];
  };
}