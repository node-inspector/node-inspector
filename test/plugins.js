'use strict';

const expect = require('chai').expect;
const manifest = require('../lib/manifest.js');
const plugins = require('../lib/plugins');
const PluginError = plugins.PluginError;
const Protocol = plugins.Protocol;
const Inspector = plugins.Inspector;

function findEq(collection, option, value) {
  return collection.filter(item => item[option] == value)[0];
}

function manifestWithProtocol(domain) {
  const commands = Array.prototype.slice.call(arguments, 1);
  return new manifest.constructor([{
    "protocol": {
      "domains": [
        {
          "domain": domain,
          "types": [],
          "commands": commands,
          "events": []
        }
      ]
    }
  }]).protocol.domains;
}

describe('Plugins', () => {
  describe('Inspector', () => {
    describe('.merge', () => {
      it('should merge common plugin', () => {
        const merged = Inspector.merge([{ name: 'a' }], [{ name: 'b' }]);

        expect(merged).to.deep.equal([
          { name: 'external/b' },
          { name: 'a' }
        ]);
      });

      it('should process exclude type', () => {
        const merged = Inspector.merge(
          [{ name: 'a' }, { name: 'b' }],
          [{ name: 'b', type: 'exclude' }]
        );

        expect(merged).to.deep.equal([
          { name: 'a' }
        ]);
      });

      it('should process override type', () => {
        const merged = Inspector.merge(
          [{ name: 'a' }, { name: 'b' }],
          [
            { name: 'b', type: 'exclude' },
            { name: 'b', override: true, type: 'autostart' }
          ]
        );

        expect(merged).to.deep.equal([
          { name: 'b', override: true, type: 'autostart' },
          { name: 'a' }
        ]);
      });
    });
  });

  describe('Protocol', () => {
    describe('.merge', () => {
      it('should merge manifests without conflicts', () => {
        const acceptor = manifestWithProtocol('a');
        const donor = manifestWithProtocol('b');
        const protocol = Protocol.merge(true, acceptor, donor);

        expect(protocol).to.have.length(2);
        expect(findEq(protocol, 'domain', 'a')).to.be.equal(acceptor[0]);
        expect(findEq(protocol, 'domain', 'b')).to.be.equal(donor[0]);
      });

      it('should merge manifests without donor', () => {
        const acceptor = manifestWithProtocol('a');
        const protocol = Protocol.merge(true, acceptor);

        expect(protocol).to.have.length(1);
        expect(findEq(protocol, 'domain', 'a')).to.be.equal(acceptor[0]);
      });

      it('should merge manifests with domain conflicts', () => {
        const acceptor = manifestWithProtocol('a', { name: 1 }, { name: 2 });
        const donor = manifestWithProtocol('a', { name: 3 }, { name: 4 });

        const protocol = Protocol.merge(true, acceptor, donor);

        const domain = findEq(protocol, 'domain', 'a');
        expect(protocol).to.have.length(1);
        expect(domain).to.be.instanceof(Object);
        expect(findEq(domain.commands, 'name', 1)).to.be.deep.equal({ "name": 1 });
        expect(findEq(domain.commands, 'name', 2)).to.be.deep.equal({ "name": 2 });
        expect(findEq(domain.commands, 'name', 3)).to.be.deep.equal({ "name": 3 });
        expect(findEq(domain.commands, 'name', 4)).to.be.deep.equal({ "name": 4 });
      });

      it('should throw on manifests with item conflicts', () => {
        const acceptor = manifestWithProtocol('a', { name: 1 }, { name: 2, prop: 1 });
        const donor = manifestWithProtocol('a', { name: 2 }, { name: 3 });

        expect(() => Protocol.merge(true, acceptor, donor))
          .to.throw(PluginError);
      });

      it('should not throw on manifests with equal items', () => {
        const acceptor = manifestWithProtocol('a', { name: 1 }, { name: 2 });
        const donor = manifestWithProtocol('a', { name: 2 }, { name: 3 });

        expect(() => Protocol.merge(true, acceptor, donor))
          .to.not.throw(PluginError);
      });
    });
  });
});
