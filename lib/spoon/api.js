var api = exports,
    esprima = require('esprima'),
    escodegen = require('escodegen'),
    uglify = require('uglify-js');

api.construct = function construct(ast) {
  var cfg = api.spoon.cfg.create();

  cfg.translate(ast);

  return cfg;
};

api.render = function render(cfg) {
  var r = api.spoon.renderer.create(cfg);

  return r.render();
};

function patch(ast, decl, callback) {
  var fn = {},
      body = null,
      stack = [];

  escodegen.traverse(ast, {
    enter: function(ast) {
      if (ast.type === 'Literal') {
        if (ast.value === decl && fn) {
          body = callback(fn).body;
        }
        return;
      } else if (ast.type === 'FunctionDeclaration' ||
                 ast.type === 'FunctionExpression') {
        stack.push({
          fn: fn,
          body: body
        });
        fn = ast;
      }
    },
    leave: function(ast) {
      if (ast === fn) {
        if (body) ast.body = body;

        // Restore previous position
        var onstack = stack.pop();
        if (onstack) {
          fn = onstack.fn;
          body = onstack.body;
        }
      }
    }
  });

  return ast;
};

api.preprocess = function preprocess(code, options, callback) {
  if (!options) options = {};

  var ast = esprima.parse(code, options.esprima);

  if (options.declaration) {
    ast = patch(ast, options.declaration, function replace(ast) {
      var cfg = api.spoon.construct(ast);

      if (callback) callback(cfg);

      ast = api.spoon.render(cfg);

      // A big fat hack here, but I need to get Esprima AST to replace it.
      ast = esprima.parse(uglify.uglify.gen_code(ast, options.uglify),
                          options.esprima).body[0];

      // Get function out of expression
      if (ast.type === 'ExpressionStatement') {
        ast = ast.expression;
      }

      return ast;
    });

    // And this is a hack too
    ast = uglify.parser.parse(escodegen.generate(ast));
  } else {
    var cfg = api.spoon.construct(ast);

    if (callback) callback(cfg);

    ast = api.spoon.render(cfg);
  }
  return uglify.uglify.gen_code(ast, options.uglify);
};

api.spoon = function spoon(code, fns, options) {
  if (!options) options = {};

  return api.preprocess(code, options, function(cfg) {
    cfg.asyncify(fns.map(function(fn) {
      return esprima.parse(fn, options.esprima);
    }), options);
  });
};
