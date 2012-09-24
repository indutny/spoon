var spoon = require('..'),
    assert = require('assert'),
    vm = require('vm'),
    esprima = require('esprima'),
    uglify = require('uglify-js');

describe('Spoon', function() {
  function test(code, callback) {
    var ast = esprima.parse(code.toString()),
        cfg = spoon.construct(ast);

    cfg.asyncify('async');

    var out = spoon.render(cfg);
    var code = uglify.uglify.gen_code(out, { beautify: true });

    var res;
    vm.runInNewContext(code + ';\nfn(callback)', {
      callback: function(r) {
        res = r;
      }
    });
    return res;
  }

  describe('asyncify', function() {
    it('should asyncify call in if', function() {
      var r = test(function fn(callback) {
        function async(a, callback) {
          callback(a);
        }

        if (1 + 2 > 2) {
          var x = async(123);
        } else {
          x = 2;
        }

        return x + 1;
      });

      r = assert.equal(r, 124);
    });

    it('should asyncify call in for', function() {
      var r = test(function fn(callback) {
        function async(a, b, callback) {
          callback(a + b);
        }

        for (var i = 0; i < 10; i++) {
          var x = async(i, x);
        }

        return x + 1;
      });

      r = assert.equal(r, 124);
    });
  });
});