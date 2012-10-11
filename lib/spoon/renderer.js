var renderer = exports,
    assert = require('assert'),
    spoon = require('../spoon');

function Renderer(cfg) {
  this.current = null;
  this.cfg = cfg;

  // Queue of blocks to visit
  this.queue = null;
  this.slots = null;
  this.fns = null;
  this.defaultSlots = null;

  // Track block visits to perfrom preorder traversal
  this.blockVisits = {};

  // Cache
  this.instructions = {};
};
renderer.Renderer = Renderer;
renderer.create = function create(cfg) {
  return new Renderer(cfg);
};

Renderer.prototype.addSlots = function addSlot(slots) {
  this.slots[this.current.id] = slots.map(function(slot, i) {
    assert(this.current.successors[i] !== undefined);
    return [ this.current.successors[i], slot ];
  }, this);
};

Renderer.prototype.getSlot = function getSlot() {
  var slots = this.current.cfrontier[0] &&
              this.slots[this.current.cfrontier[0].id];
  if (!slots) return this.defaultSlots[0];

  // One branch - one slot
  if (slots.length === 1) return slots[0][1];

  // Choose closest branch
  if (this.current.distance(slots[0][0]) < this.current.distance(slots[1][0])) {
    return slots[0][1];
  } else {
    return slots[1][1];
  }
};

Renderer.prototype.canVisit = function canVisit(block, update) {
  var r;

  if (update !== false) {
    if (!this.blockVisits[block.id]) {
      r = this.blockVisits[block.id] = 1;
    } else {
      r = ++this.blockVisits[block.id];
    }
  } else {
    r = this.blockVisits[block.id] || 0;
  }

  return block.loop ?
      r == (update === false ? 0 : 1)
      :
      r >= block.predecessors.length;
};

Renderer.prototype.render = function render() {
  var result = ['toplevel', []];

  this.cfg.derive();

  this.queue = [ this.cfg.root ];
  this.slots = {};
  this.fns = {};
  this.defaultSlots = [ null, result[1] ];

  while (this.queue.length > 0) {
    var current = this.queue.pop();
    this.current = current;
    if (this.current.predecessors.length === 0) {
      this.defaultSlots.shift();
    }

    var slot = this.getSlot();

    // Visit only if all parents were processed
    if (!this.canVisit(current)) continue;

    this.renderBlock(current).forEach(function(instr) {
      slot.push(['stat', instr]);
    });

    // Enqueue blocks with priority to left one
    current.successors.slice().reverse().forEach(function(block) {
      this.queue.push(block);
    }, this);
  }

  return result;
};

Renderer.prototype.renderBlock = function renderBlock(block) {
  var ast = [];

  // Visit instructions in reverse order to detect dependencies
  block.instructions.slice().reverse().forEach(function(instr) {
    // If instruction was already rendered - skip it
    if (this.instructions[instr.id]) return;

    this.currentInstruction = instr;

    var instr = this.renderInstruction(instr);
    if (instr) ast.push(instr);
  }, this);

  ast.reverse();

  return ast;
};

Renderer.prototype.renderInstruction = function renderInstruction(instr) {
  var name = ['name', '__$i' + instr.id];
  if (this.current !== instr.block) return name;

  // If instruction has external uses - generate it separately and put it's
  // result to the variable
  var external = instr.isExternal ||
                 instr.uses.length > 1 ||
                 instr.uses.length === 1 &&
                 instr.uses[0].block !== this.current;

  if (external && this.currentInstruction !== instr) return name;

  var args = instr.args.map(function(arg) {
    if (arg instanceof spoon.instruction.Instruction) {
      return this.renderInstruction(arg);
    }
    return arg;
  }, this);

  var t = instr.type,
      fn;

  if (t === 'literal') {
    fn = this.renderLiteral;
  } else if (t === 'get') {
    fn = this.renderGet;
  } else if (t === 'set') {
    fn = this.renderSet;
  } else if (t === 'setprop') {
    fn = this.renderSetprop;
  } else if (t === 'var') {
    fn = this.renderVar;
  } else if (t === 'binop') {
    fn = this.renderBinop;
  } else if (t === 'unop') {
    fn = this.renderUnop;
  } else if (t === 'return') {
    fn = this.renderReturn;
  } else if (t === 'fn') {
    fn = this.renderFn;
  } else if (t === 'goto') {
    fn = this.renderGoto;
  } else if (t === 'call') {
    fn = this.renderCall;
  } else if (t === 'method') {
    fn = this.renderMethod;
  } else if (t === 'getprop') {
    fn = this.renderGetprop;
  } else if (t === 'getprops') {
    fn = this.renderGetprops;
  } else if (t === 'if') {
    fn = this.renderIf;
  } else if (t === 'logical') {
    fn = this.renderIf;
  } else if (t === 'loop') {
    fn = this.renderLoop;
  } else if (t === 'break') {
    fn = this.renderBreak;
  } else if (t === 'sbreak') {
    fn = this.renderSBreak;
  } else if (t === 'continue') {
    fn = this.renderContinue;
  } else if (t === 'phi') {
    fn = this.renderPhi;
  } else if (t === 'phimove') {
    fn = this.renderPhiMove;
  } else if (t === 'ternary') {
    fn = this.renderIf;
  } else if (t === 'object') {
    fn = this.renderObject;
  } else if (t === 'array') {
    fn = this.renderArray;
  } else if (t === 'try') {
    fn = this.renderTry;
  } else if (t === 'throw') {
    fn = this.renderThrow;
  } else if (t === 'new') {
    fn = this.renderNew;
  } else if (t === 'async-goto') {
    fn = this.renderAsyncGoto;
  } else if (t === 'async-return') {
    fn = this.renderAsyncReturn;
  } else if (t === 'async-end') {
    fn = this.renderAsyncEnd;
  } else if (t === 'async-prelude') {
    fn = this.renderAsyncPrelude;
  } else if (t === 'nop') {
    fn = this.renderNop;
  } else {
    throw new Error('Unexpected instruction: ' + t);
  }

  var ast = fn.call(this, args, instr);
  if (external) {
    if (!instr.fn || instr.fn.id === 0) {
      if (ast === null) {
        ast = ['var', [[name[1]]]];
      } else {
        ast = ['var', [[name[1], ast]]];
      }
    } else {
      if (ast !== null) {
        // Wrap instructions with external use into variable declaration.
        // Insert declaration on the level accessible for both instruction
        // and it's every use.
        ast = ['assign', true, name, ast];
      }

      var decl = ['var', [[name[1]]]];
      this.fns[instr.fn.id].unshift(decl);
    }
  }
  this.instructions[instr.id] = ast;

  return ast;
};

Renderer.prototype.renderLiteral = function renderLiteral(args) {
  if (typeof args[0] === 'string') {
    return ['string', args[0]];
  } else if (typeof args[0] === 'number') {
    return ['num', args[0]];
  } else {
    return ['name', args[0] + ''];
  }
};

Renderer.prototype.renderGet = function renderGet(args) {
  return ['name', args[0]];
};

Renderer.prototype.renderSet = function renderSet(args) {
  return ['assign', args[0] === '=' ? true : args[0].replace(/=/g, ''),
          ['name', args[1]], args[2]];
};

Renderer.prototype.renderSetprop = function renderSetprop(args) {
  return ['assign', args[0] === '=' ? true : args[0].replace(/=/g, ''),
          this.renderGetprop(args.slice(1, 3)), args[3]];
};

Renderer.prototype.renderVar = function renderVar(args) {
  return ['var', args.map(function(name) {
    return [name];
  })];
};

Renderer.prototype.renderBinop = function renderBinop(args) {
  return ['binary', args[0], args[1], args[2]];
};

Renderer.prototype.renderUnop = function renderUnop(args) {
  return ['unary-' + (args[1] ? 'prefix' : 'postfix'), args[0], args[2]];
};

Renderer.prototype.renderReturn = function renderReturn(args) {
  return ['return', args[0]];
};

Renderer.prototype.renderFn = function renderFn(args, instr) {
  var prefix = instr.isExpression ? 'function' : 'defun',
      name = instr.name,
      slot = [];

  var inputs = instr.params.slice();

  this.queue.unshift(args[0]);
  this.defaultSlots.push(slot);
  this.fns[instr.args[0].id] = slot;

  return [prefix, name, inputs, slot];
};

Renderer.prototype.renderGoto = function renderGoto() {
  return null;
};

Renderer.prototype.renderCall = function renderCall(args) {
  return ['call', args[0], args.slice(1)];
};

Renderer.prototype.renderMethod = function renderMethod(args) {
  return ['call', this.renderGetprop(args.slice(0, 2)), args.slice(2)];
};

Renderer.prototype.renderGetprop = function renderGetprop(args) {
  if (args[1][0] === 'string' && /^[$_a-z][$_a-z0-9]*$/i.test(args[1][1])) {
    return ['dot', args[0], args[1][1]];
  }
  return ['sub', args[0], args[1]];
};

Renderer.prototype.renderGetprops = function renderGetprops(args) {
  var type = ['unary-prefix', 'typeof', args[0]],
      isObject = ['binary',
                    '&&',
                    ['binary', '===', type, ['string', 'object']],
                    ['binary', '!==', args[0], ['name', 'null']]];

  return ['conditional', isObject,
            ['call', ['dot', ['name', 'Object'], 'keys'], [ args[0] ]],
            ['object', []]];
};

Renderer.prototype.renderIf = function renderIf(args) {
  var slots = [ [], [] ],
      ast = ['if', args[0]].concat(slots.map(function(slot) {
        return ['block', slot ];
      }));

  this.addSlots(slots);

  return ast;
};

Renderer.prototype.renderLoop = function renderLoop(args) {
  var slot = [];
  this.addSlots([ slot, this.getSlot() ]);
  return ['while', args[0] ? args[0] : ['name', 'true'], ['block', slot]];
};

Renderer.prototype.renderBreak = function renderBreak(args) {
  return ['break'];
};

Renderer.prototype.renderSBreak = function renderSBreak(args) {
  return null;
};

Renderer.prototype.renderContinue = function renderContinue(args) {
  return ['continue'];
};

Renderer.prototype.renderContinue = function renderContinue(args) {
  return ['continue'];
};

Renderer.prototype.renderPhi = function renderPhi() {
  return null;
};

Renderer.prototype.renderPhiMove = function renderPhiMove(args) {
  return ['assign', true, args[1], args[0]];
};

Renderer.prototype.renderObject = function renderObject(args) {
  var kvs = [];

  for (var i = 0; i < args.length; i += 2) {
    kvs.push([ args[i], args[i + 1] ]);
  }

  return ['object', kvs];
};

Renderer.prototype.renderArray = function renderArray(args) {
  return ['array', args];
};

Renderer.prototype.renderTry = function renderTry(args, instr) {
  var body = [],
      caught = [];

  this.addSlots([body, caught]);
  return ['try', body, [instr.catchParam, caught], undefined];
};

Renderer.prototype.renderThrow = function renderThrow(args) {
  return ['throw', args[0]];
};

Renderer.prototype.renderNew = function renderNew(args) {
  return ['new', args[0], args.slice(1)];
};

Renderer.prototype.renderAsyncReturn = function renderAsyncReturn(args) {
  return ['return', ['call',
    ['dot', ['name', '__$callback'], 'call'],
    [['name', 'this'],['name', 'null']].concat(args)]];
};

Renderer.prototype.renderAsyncEnd = function renderAsyncEnd(args) {
  return ['return', args[0]];
};

Renderer.prototype.renderAsyncGoto = function renderAsyncGoto(args) {
  return ['return', ['call', ['dot', args[0], 'call'], [['name', 'this']]]];
};

Renderer.prototype.renderAsyncPrelude = function renderAsyncPrelude(args) {
  return ['if', ['name', '__$e'],
      ['block', [
        ['return', ['call', ['dot', ['name', '__$callback'], 'call'],
                            [['name', 'this'],['name', '__$e']]]]
      ]],
      ['block', [
        ['assign', true, ['name', args[0]], ['name', '__$r']]
      ]]
  ];
};

Renderer.prototype.renderNop = function renderNop() {
  return null;
};
