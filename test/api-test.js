var spoon = require('..'),
    esprima = require('esprima'),
    uglify = require('uglify-js');

describe('Spoon', function() {
  function apply(code) {
    var ast = esprima.parse(code),
        cfg = spoon.construct(ast);

    console.log(cfg.toString());

    var out = spoon.render(cfg);
    console.log(require('util').inspect(out, false, 40));
    console.log(uglify.uglify.gen_code(out, { beautify: true }));

    return out;
  }
  describe('constructing CFG from AST', function() {
    it('should work with sample code', function() {
      apply('var x = 1 + 2 * 3;\n' +
            'if (x > 2) {\n' +
            '  console.log("yay");\n' +
            '} else {\n' +
            '  log(function() { "yay" });\n' +
            '}\n' +
            'function x(a,b) {\n' +
            '  return a + b;\n' +
            '}');
    });

    it('should work with while loop', function() {
      apply('var i = 0;\n' +
            'while (i < 10) {\n' +
            '  if (i == 9) {\n' +
            '    break;\n' +
            '  } else if (i > 10) {\n' +
            '    continue;\n' +
            '  }\n' +
            '  i++;\n' +
            '}\n' +
            'i');
    });

    it('should work with do while loop', function() {
      apply('var i = 0;\n' +
            'do {\n' +
            '  i++;\n' +
            '} while (i < 10)\n' +
            'i');
    });
  });
});
