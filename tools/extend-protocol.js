var protocol = require('./protocol.json');

function findEq(collection, option, value) {
  return collection.filter(function(item) {
    return item[option] == value;
  })[0];
}

function concat(acceptor, donor) {
  acceptor.push.apply(acceptor, donor);
}

module.exports = function(overrides) {
  overrides.domains.forEach(function(domain) {
    var origDomain = findEq(protocol.domains, 'domain', domain.domain);
    if (origDomain) {
      ['commands', 'events', 'types'].forEach(function(section) {
        concat(origDomain[section], domain[section] || []);
      });
    } else {
      protocol.domains.push(domain);
    }
  });

  return protocol;
};
