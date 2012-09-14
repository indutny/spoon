var renderer = exports,
    assert = require('assert'),
    spoon = require('../spoon');

function Renderer(cfg) {
  this.ctx = null;
  this.cfg = cfg;

  this.queue = [];
  this.slots = [];

  this.blocks = {};
  this.blockVisits = {};
  this.instructions = {};
};
renderer.Renderer = Renderer;
renderer.create = function create(cfg) {
  return new Renderer(cfg);
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

  this.queue.push(this.cfg.root);
  this.slots.unshift(result[1]);

  while (this.queue.length > 0) {
    var current = this.queue.pop(),
        slot = this.slots[0];

    // Visit only if all parents were processed
    if (!this.canVisit(current)) continue;

    this.renderBlock(current).forEach(function(instr) {
      slot.push(['stat', instr]);
    });

    var deadEnd = current.successors.length === 0;

    var preJoin = false;
    if (current.successors.length === 1) {
      var succ = current.successors[0];
      preJoin = succ.loop ? !this.canVisit(succ, false) :
                            succ.predecessors.length === 2;
    }

    // Move to another ast slot on dead-end or pre-join
    if (deadEnd || preJoin) {
      this.slots.shift();
    }

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

    var instr = this.renderInstruction(instr);
    if (instr) ast.push(instr);
  }, this);

  ast.reverse();
  this.blocks[block.id] = ast;

  return ast;
};

Renderer.prototype.renderInstruction = function renderInstruction(instr) {
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
  } else if (t === 'getprop') {
    fn = this.renderGetprop;
  } else if (t === 'if') {
    fn = this.renderIf;
  } else if (t === 'while') {
    fn = this.renderWhile;
  } else if (t === 'do') {
    fn = this.renderDo;
  } else if (t === 'doend') {
    fn = this.renderDoEnd;
  } else if (t === 'break') {
    fn = this.renderBreak;
  } else if (t === 'continue') {
    fn = this.renderContinue;
  } else {
    throw new Error('Unexpected instruction: ' + t);
  }
  var ast = fn.call(this, args, instr);
  this.instructions[instr.id] = ast;
  return ast;
};

Renderer.prototype.renderLiteral = function renderLiteral(args) {
  if (typeof args[0] === 'string') {
    return ['string', args[0]];
  } else {
    return ['num', args[0]];
  }
};

Renderer.prototype.renderGet = function renderGet(args) {
  return ['name', args[0]];
};

Renderer.prototype.renderSet = function renderSet(args) {
  return ['assign', true, ['name', args[0]], args[1]];
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
  var prefix = instr.ast.type === 'FunctionExpression' ? 'function' : 'defun',
      name = instr.ast.id && instr.ast.id.name,
      slot = [];

  var inputs = instr.ast.params.map(function(param) {
    return param.name;
  });

  this.queue.unshift(args[0]);
  this.slots.push(slot);
  return [prefix, name, inputs, slot];
};

Renderer.prototype.renderGoto = function renderGoto() {
  return null;
};

Renderer.prototype.renderCall = function renderCall(args) {
  return ['call', args[0], args.slice(1)];
};

Renderer.prototype.renderGetprop = function renderGetprop(args) {
  return ['sub', args[0], args[1]];
};

Renderer.prototype.renderIf = function renderIf(args) {
  return ['if', args[0]].concat(args.slice(1).reverse().map(function() {
    var slot = [];
    this.slots.unshift(slot);
    return ['block', slot];
  }, this).reverse());
};

Renderer.prototype.renderWhile = function renderWhile(args) {
  var slot = [];
  this.slots.unshift(slot);
  return ['while', args[0], ['block', slot]];
};

Renderer.prototype.renderDo = function renderDo(args) {
  var slot = [];
  this.slots.unshift(slot);
  console.log(args);
  return ['do', ['num', 0], ['block', slot]];
};

Renderer.prototype.renderDoEnd = function renderDoEnd(args) {
  return null;
};

Renderer.prototype.renderBreak = function renderBreak(args) {
  return ['break'];
};

Renderer.prototype.renderContinue = function renderContinue(args) {
  return ['continue'];
};
