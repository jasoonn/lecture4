import wabt from 'wabt';
import {Stmt, Expr, Type, Op} from './ast';
import {parseProgram} from './parser';
import { tcProgram } from './tc';

function variableNames(stmts: Stmt<Type>[]) : string[] {
  const vars : Array<string> = [];
  stmts.forEach((stmt) => {
    if(stmt.tag === "assign") { vars.push(stmt.name); }
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

export async function run(watSource : string) : Promise<number> {
  const wabtApi = await wabt();

  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, {});
  return (wasmModule.instance.exports as any)._start();
}

(window as any)["runWat"] = run;

export function opStmts(op : Op) {
  switch(op) {
    case "+": return [`i32.add`];
    case "-": return [`i32.sub`];
    case ">": return [`i32.gt_s`];
    case "and": return [`i32.and`];
    case "or": return [`i32.or`];
    default:
      throw new Error(`Unhandled or unknown op: ${op}`);
  }
}

export function codeGenExpr(expr : Expr<Type>) : Array<string> {
  switch(expr.tag) {
    case "id": return [`(local.get $${expr.name})`];
    case "number": return [`(i32.const ${expr.value})`];
    case "true": return [`(i32.const 1)`];
    case "false": return [`(i32.const 0)`];
    case "binop": {
      const lhsExprs = codeGenExpr(expr.lhs);
      const rhsExprs = codeGenExpr(expr.rhs);
      const opstmts = opStmts(expr.op);
      return [...lhsExprs, ...rhsExprs, ...opstmts];
    }
    case "call":
      const valStmts = expr.arguments.map(codeGenExpr).flat();
      valStmts.push(`(call $${expr.name})`);
      return valStmts;
  }
}
export function codeGenStmt(stmt : Stmt<Type>) : Array<string> {
  switch(stmt.tag) {
    case "define":
      const variables = variableNames(stmt.body);
      const params = stmt.parameters.map(p => `(param $${p.name} i32)`).join(" ");
      const stmts = stmt.body.map(codeGenStmt).flat();
      const stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${stmtsBody}
        (i32.const 0))`];
    case "return":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push(`(local.set $${stmt.name})`);
      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr);
      result.push("(local.set $scratch)");
      return result;
  }
}
export function compile(source : string) : string {
  const ast = parseProgram(source);
  tcProgram(ast);
  const [vars, funs, stmts] = varsFunsStmts(ast);
  const funsCode : string[] = funs.map(codeGenStmt).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");
  const varDecls = vars.map(v => `(global $${v} i32)`);

  const allStmts = stmts.map(codeGenStmt).flat();

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
      ${varDecls}
      ${allFuns}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}
