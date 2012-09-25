var spoon = require('..'),
    assert = require('assert'),
    vm = require('vm'),
    esprima = require('esprima'),
    uglify = require('uglify-js');

describe('Spoon', function() {
  function test(code, what) {
    var ast = esprima.parse(code.toString()),
        cfg = spoon.construct(ast);

    cfg.asyncify(esprima.parse(what || 'async'));

    var out = spoon.render(cfg);
    var code = uglify.uglify.gen_code(out, { beautify: true });

    var res,
        once = false;
    vm.runInNewContext(code + ';\nfn(callback)', {
      callback: function(r) {
        if (once) throw new Error('Called twice');
        once = true;

        res = r;
      }
    });
    return res;
  }

  describe('asyncify', function() {
    it('should asyncify method', function() {
      var r = test(function fn(callback) {
        var obj = {
          async: function async(a, callback) {
            callback(a);
          }
        };
        return obj.async(1);
      }, 'obj.async');
      assert.equal(r, 1);
    });

    it('should asyncify call in sequence', function() {
      var r = test(function fn(callback) {
        function async(a, callback) {
          callback(1);
        }
        return 1, async(1), 2;
      });
      assert.equal(r, 2);
    });

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

        var x = 0;
        for (var i = 0; i < 10; i++) {
          x = async(i, x);
        }

        return x + 1;
      });

      r = assert.equal(r, 46);
    });

    it('should asyncify call in do while', function() {
      var r = test(function fn(callback) {
        function async(a, b, callback) {
          callback(a + b);
        }

        var x = 0,
            i = 0;
        do {
          i++;
          x = async(i, x);
        } while (i < 10);

        return x + 1;
      });

      r = assert.equal(r, 56);
    });
  });
});
