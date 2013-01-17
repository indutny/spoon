var spoon = require('..'),
    assert = require('assert'),
    vm = require('vm'),
    esprima = require('esprima'),
    escodegen = require('escodegen');

describe('Spoon', function() {
  describe('spoon() API function', function() {
    it('should work properly', function() {
      var code = spoon(function a(__$callback) {
        "enable spoon";
        return 1;
      }.toString(), ['async'], {
        declaration: 'enable spoon'
      });

      vm.runInNewContext(code + ';a(callback);', {
        callback: function(err, value) {
          assert.equal(value, 1);
        }
      });
    });
  });
});
