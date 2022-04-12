import wabt from 'wabt';
import {Stmt, Expr, Type, Op} from './ast';
import {parseProgram} from './parser';
import { tcProgram } from './tc';

type Env = Map<string, boolean>;

function variableNames(stmts: Stmt<Type>[]) : string[] {
  const vars : Array<string> = [];
  stmts.forEach((stmt) => {
    if(stmt.tag === "var") { vars.push(stmt.name); }
  });
  return vars;
}
function funs(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag === "define");
}
function nonFuns(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag !== "define");
}
function varsFunsStmts(stmts: Stmt<Type>[]) : [string[], Stmt<Type>[], Stmt<Type>[]] {
  return [variableNames(stmts), funs(stmts), nonFuns(stmts)];
}

export async function run(watSource : string, config: any) : Promise<number> {
  const wabtApi = await wabt();

  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, config);
  return (wasmModule.instance.exports as any)._start();
}

export function opStmts(op : Op) {
  switch(op) {
    case "+": return [`(i32.add)`];
    case "-": return [`(i32.sub)`];
    case ">": return [`(i32.gt_s)
    (i32.const 2)
    (i32.or)
    `];
    case "and": return [`(i32.and)
    (i32.const 2)
    (i32.or)
    `];
    case "or": return [`(i32.or)
    (i32.const 2)
    (i32.or)
    `];
    case "*": return [`i32.mul`];
    case "//": return [`(i32.div_s)
    (i32.const 2)
    (i32.shl)
    `];
    case "%": return [`i32.rem_s`];
    case "==": return [`(i32.eq)
    (i32.const 2)
    (i32.or)
    `];
    case "!=": return [`(i32.ne)
    (i32.const 2)
    (i32.or)
    `];
    case "<=": return [`(i32.le_s)
    (i32.const 2)
    (i32.or)
    `];
    case ">=": return [`(i32.ge_s)
    (i32.const 2)
    (i32.or)
    `];
    case "<": return [`(i32.lt_s)
    (i32.const 2)
    (i32.or)
    `];
    case "is": return [`(i32.eq)
    (i32.const 2)
    (i32.or)
    `];
    default:
      throw new Error(`Unhandled or unknown op: ${op}`);
  }
}

export function codeGenExpr(expr : Expr<Type>, locals : Env, isGlobal:boolean=false) : Array<string> {
  switch(expr.tag) {
    case "number": return [`(i32.const ${expr.value<<2})`];
    case "true": return [`(i32.const 3)`];
    case "false": return [`(i32.const 2)`];
    case "none": return [`(i32.const 1)`];
    case "id":
      // Since we type-checked for making sure all variable exist, here we
      // just check if it's a local variable and assume it is global if not
      if(locals.has(expr.name)) { return [`(local.get $${expr.name})`]; }
      else { return [`(global.get $${expr.name})`]; }
    case "binop": {
      const lhsExprs = codeGenExpr(expr.lhs, locals);
      const rhsExprs = codeGenExpr(expr.rhs, locals);
      const opstmts = opStmts(expr.op);
      return [...lhsExprs, ...rhsExprs, ...opstmts];
    }
    case "call":
      const valStmts = expr.args.map(e => codeGenExpr(e, locals)).flat();
      let toCall = expr.name;
      if(expr.name === "print") {
        switch(expr.args[0].a) {
          case "bool": toCall = "print_bool"; break;
          case "int": toCall = "print_num"; break;
          case "none": toCall = "print_none"; break;
        }
      }
      valStmts.push(`(call $${toCall})`);
      return valStmts;
  }
}
export function codeGenStmt(stmt : Stmt<Type>, locals : Env) : Array<string> {
  console.log(stmt)
  switch(stmt.tag) {
    case "define":
      const withParamsAndVariables = new Map<string, boolean>(locals.entries());

      // Construct the environment for the function body
      const variables = variableNames(stmt.body);
      variables.forEach(v => withParamsAndVariables.set(v, true));
      stmt.params.forEach(p => withParamsAndVariables.set(p.name, true));

      // Construct the code for params and variable declarations in the body
      const params = stmt.params.map(p => `(param $${p.name} i32)`).join(" ");
      const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");

      const stmts = stmt.body.map(s => codeGenStmt(s, withParamsAndVariables)).flat();
      const stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
    case "if":
      var cond = codeGenExpr(stmt.cond, locals).join("\n");
      var ifBody = stmt.ifBody.map(s => codeGenStmt(s, locals)).flat().join("\n");
      var elseIfCode = ``;
      var elseCode = ``;
      if (stmt.elseIfCond!==undefined){
        const elseIfCond = codeGenExpr(stmt.elseIfCond, locals).join("\n");
        const elseIfBody = stmt.elseIfBody.map(s => codeGenStmt(s, locals)).flat().join("\n");;
        var innerElse = ``;
        if (stmt.elseBody!==undefined){
          const elseBody = stmt.elseBody.map(s => codeGenStmt(s, locals)).flat().join("\n");;
          innerElse = `
               (else
                ${elseBody}
               )
          `;
        }
        elseIfCode = `
            (else
              ${elseIfCond}
              i32.const 3
              i32.eq
              (if
                (then
                  ${elseIfBody}
                )
                ${innerElse}
              )
            )
        `;
      } else if (stmt.elseBody!==undefined){
        const elseBody = stmt.elseBody.map(s => codeGenStmt(s, locals)).flat().join("\n");
        elseCode = `
              (else
              ${elseBody}
              )
        `;
      }
      
      return [`
        ${cond}
        i32.const 3
        i32.eq
        (if
          (then
            ${ifBody}
          )
          ${elseIfCode}
          ${elseCode}
        )
      `]
    case "while":
      var condStmts = codeGenExpr(stmt.cond, locals).join("\n");
      const whileStmts = stmt.stmtBody.map(s => codeGenStmt(s, locals)).flat();
      const whileStmtsBody = whileStmts.join("\n");
      console.log(condStmts);
      console.log(whileStmtsBody);
      return [`
        (loop $my_loop 
          ${condStmts}
          i32.const 3
          i32.eq
          (if
            (then
              ${whileStmtsBody}
              br $my_loop
            )
          )
        )`];
    case "return":
      var valStmts = codeGenExpr(stmt.value, locals);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value, locals);
      if(locals.has(stmt.name)) { valStmts.push(`(local.set $${stmt.name})`); }
      else { valStmts.push(`(global.set $${stmt.name})`); }
      return valStmts;
    case "var":
      var valStmts = codeGenExpr(stmt.literal, locals);
      if(locals.has(stmt.name)) { valStmts.push(`(local.set $${stmt.name})`); }
      else { valStmts.push(`(global.set $${stmt.name})`); }
      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr, locals);
      result.push("(local.set $scratch)");
      return result;
  }
}
export function compile(source : string) : string {
  let ast = parseProgram(source);
  ast = tcProgram(ast);
  const emptyEnv = new Map<string, boolean>();
  const [vars, funs, stmts] = varsFunsStmts(ast);
  const funsCode : string[] = funs.map(f => codeGenStmt(f, emptyEnv)).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");
  const varDecls = vars.map(v => `(global $${v} (mut i32) (i32.const 0))`).join("\n");

  const allStmts = stmts.map(s => codeGenStmt(s, emptyEnv)).flat();

  const main = [`(local $scratch i32)`, ...allStmts].join("\n");

  const lastStmt = ast[ast.length - 1];
  const isExpr = lastStmt.tag === "expr";
  var retType = "";
  var retVal = "";
  if(isExpr) {
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }

  return `
    (module
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      ${varDecls}
      ${allFuns}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}
