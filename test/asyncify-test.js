var spoon = require('..'),
    assert = require('assert'),
    vm = require('vm'),
    esprima = require('esprima'),
    uglify = require('uglify-js');

describe('Spoon', function() {
  function test(code, callback) {
    var ast = esprima.parse(code.toString()
                                .replace(/^function.*?(){|}$/g, '')),
        cfg = spoon.construct(ast);

    cfg.asyncify('async');

    var out = spoon.render(cfg);
    var code = uglify.uglify.gen_code(out, { beautify: true });

    assert.deepEqual(vm.runInNewContext(code, {
      callback: callback
    }), expected);
  }

  describe('asyncify', function() {
    it('should asyncify call without uses', function(callback) {
      test(function() {
        function x(a, callback) {
          callback(a);
        }

        x(123);
      }, function(r) {
        assert.equal(r, 123);
        callback();
      });
    });
  });
});
