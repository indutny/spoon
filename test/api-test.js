var spoon = require('..'),
    assert = require('assert'),
    vm = require('vm'),
    esprima = require('esprima'),
    uglify = require('uglify-js');

describe('Spoon', function() {
  function test(code, expected) {
    var ast = esprima.parse(code),
        cfg = spoon.construct(ast);

    var out = spoon.render(cfg);
    var code = uglify.uglify.gen_code(out, { beautify: true });

    assert.deepEqual(vm.runInNewContext(code), expected);
  }

  describe('constructing CFG from AST', function() {
    it('should work with function declarations and expressions', function() {
      test('var x = 1 + 2 * 3;\n' +
           'if (x > 1234) {\n' +
           '  log("yay");\n' +
           '} else {\n' +
           '  log(function() { return "yay" });\n' +
           '}\n' +
           'function log(x) {\n' +
           '  return typeof x === "function" ? x() : x;\n' +
           '}',
           'yay');
    });

    it('should work with seqeunces', function() {
      test('var a = 1;(a += 1),(a = 2 * a),a', 4);
    });

    it('should work with member set', function() {
      test('var a = { d: 3 };a.b = 1;a.c = 2;a.b + a.c + a.d', 6);
    });

    it('should work with logical expressions', function() {
      test('var c = false;\n' +
           'function a() {\n' +
           '  if (c) return false;\n' +
           '  return 123;\n' +
           '}\n' +
           'function b() {\n' +
           '  c = true;\n' +
           '  return false;\n' +
           '}\n' +
           'a() || b()', 123);
    });

    it('should work with while loop', function() {
      test('var i = 0;\n' +
           'while (i < 10) {\n' +
           '  if (i == 9) {\n' +
           '    break;\n' +
           '  } else if (i > 10) {\n' +
           '    continue;\n' +
           '  }\n' +
           '  i++;\n' +
           '}\n' +
           'i',
           9);
    });

    it('should work with do while loop', function() {
      test('var i = 0;\n' +
           'do {\n' +
           '  if (i == 5) {\n' +
           '    break;\n' +
           '  } else if (i > 10) {\n' +
           '    continue;\n' +
           '  }\n' +
           '  i++;\n' +
           '} while (i < 10)\n' +
           'i',
           5);
    });
  });
});
