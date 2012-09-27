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
  var lastFn = null;
  function traverse(ast) {
    if (Array.isArray(ast)) return ast.forEach(traverse);

    if (typeof ast !== 'object' || ast === null || !ast.type) return;
    var restore;

    if (ast.type === 'Literal') {
      if (ast.value === decl && lastFn) {
        lastFn.body = callback(lastFn).body[0].body;
      }
      return;
    } else if (ast.type === 'FunctionDeclaration' ||
               ast.type ===' FunctionExpression') {
      restore = lastFn;
      lastFn = ast;
    }

    // Very naive traverse
    Object.keys(ast).forEach(function(key) {
      // Ignore obvious keys
      if (key === 'type' || key === 'prefix' || key === 'operator') return;
      traverse(ast[key]);
    });

    if (restore !== undefined) lastFn = restore;
  }

  traverse(ast);
};

api.preprocess = function preprocess(code, options, callback) {
  if (!options) options = {};

  var ast = esprima.parse(code, options.esprima);

  if (options.declaration) {
    patch(ast, options.declaration, function replace(ast) {
      var cfg = api.spoon.construct(ast);

      if (callback) callback(cfg);

      ast = api.spoon.render(cfg);

      // A big fat hack here, but I need to get Esprima AST to replace it.
      return esprima.parse(uglify.uglify.gen_code(ast, options.uglify),
                           options.esprima);
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
