var spoon = require('..'),
    assert = require('assert'),
    vm = require('vm'),
    esprima = require('esprima'),
    uglify = require('uglify-js');

describe('Spoon', function() {
  function test(code, what) {
    var ast = esprima.parse(code.toString()),
        cfg = spoon.construct(ast);

    cfg.asyncify([esprima.parse(what || 'async')], 1);

    var out = spoon.render(cfg);
    var code = uglify.uglify.gen_code(out, { beautify: true });
    console.log(code);

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
      var r = test(function fn(__$callback) {
        "enable spoon";
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
      var r = test(function fn(__$callback) {
        "enable spoon";
        function async(a, callback) {
          callback(1);
        }
        return 1, async(1), 2;
      });
      assert.equal(r, 2);
    });

    it('should asyncify call in if', function() {
      var r = test(function fn(__$callback) {
        "enable spoon";
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

    it('should asyncify call in for loop', function() {
      var r = test(function fn(__$callback) {
        "enable spoon";
        function async(a, b, callback) {
          callback(a + b);
        }

        for (var i = 0; i < 10; i++) {
          var x = async(i, x || 0);
        }

        return x + 1;
      });

      r = assert.equal(r, 46);
    });

    it('should asyncify call in do while loop', function() {
      var r = test(function fn(__$callback) {
        "enable spoon";
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

    it('should asyncify call in for in loop', function() {
      var r = test(function fn(__$callback) {
        "enable spoon";
        function async(a, b, callback) {
          callback(a + b);
        }

        var obj = { a : 1, b : 2 };

        for (var i in obj) {
          var x = async(obj[i], x || 0);
        }

        return x + 1;
      });

      r = assert.equal(r, 4);
    });
  });
});
