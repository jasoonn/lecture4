import exp from 'constants';
import wabt from 'wabt';
import {Stmt, Expr, Type, Op, UniOp} from './ast';
import {parseProgram} from './parser';
import { tcProgram } from './tc';

type Env = Map<string, boolean>;
type ClassEnv = Map<string, Map<string, [number, Expr<any>]>>;

function variableNames(stmts: Stmt<Type>[]) : string[] {
  const vars : Array<string> = [];
  stmts.forEach((stmt) => {
    if(stmt.tag === "varinit") { vars.push(stmt.name); }
  });
  return vars;
}
function classes(stmts: Stmt<Type>[]): Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag==="class");
}
function funs(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag === "define");
}
function nonFunsAndClasses(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => (stmt.tag !== "define"&&stmt.tag !== "class" ));
}
function varsFunsStmts(stmts: Stmt<Type>[]) : [string[], Stmt<Type>[], Stmt<Type>[], Stmt<Type>[]] {
  return [variableNames(stmts), funs(stmts), classes(stmts), nonFunsAndClasses(stmts)];
}

export async function runn(watSource : string, config: any) : Promise<number> {
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
    case "*": return [`(i32.mul)`];
    case "//": return [`(i32.div_s)`]; // trap: div by 0
    case "%": return [`(i32.rem_s)`]; // trap div by 0
    case "==": return [`(i32.eq)`];
    case "!=": return [`(i32.ne)`];
    case "<": return [`(i32.lt_s)`];
    case ">": return [`(i32.gt_s)`];
    case "<=": return [`(i32.le_s)`];
    case ">=": return [`(i32.ge_s)`];
    case "and": return [`(i32.and)`];
    case "or": return [`(i32.or)`];
    case "is": return [`(i32.eq)`];
    default:
      throw new Error(`Unhandled or unknown op: ${op}`);
  }
}

export function codeGenExpr(expr : Expr<Type>, locals : Env, classes: ClassEnv, className: string,) : Array<string> {
  switch(expr.tag) {
    case "number": return [`(i32.const ${expr.value})`];
    case "true": return [`(i32.const 1)`];
    case "false": return [`(i32.const 0)`];
    case "none": return [`(i32.const 0)`];
    case "id":
      // Since we type-checked for making sure all variable exist, here we
      // just check if it's a local variable and assume it is global if not
      if(locals.has(expr.name)||expr.name === "self") { return [`(local.get $${expr.name})`]; }
      else { return [`(global.get $${expr.name})`]; }
    case "binop": {
      const lhsExprs = codeGenExpr(expr.lhs, locals, classes, className);
      const rhsExprs = codeGenExpr(expr.rhs, locals, classes, className);
      const opstmts = opStmts(expr.op);
      return [...lhsExprs, ...rhsExprs, ...opstmts];
    }
    case "getField": {
      //The object position is on the stack
      if (expr.objExpr.tag==="id" && expr.objExpr.name==="self") {
        return [
          `(local.get $self)`,
          `(i32.const ${classes.get(className).get(expr.vairable)[0]*4})`,
          `(i32.add)`, 
          `(i32.load)`
        ];
      }
      const objExpr = codeGenExpr(expr.objExpr, locals, classes, className);
      return [
        ...objExpr,
        `(tee_local $tmpForJudge)`,
        `(get_local $tmpForJudge)`,
        `(i32.const 4)`,
        `(i32.lt_s)`,
        `(if
          (then
            (call $err)
          )
        )`,
        //@ts-ignore
        `(i32.const ${classes.get(expr.objExpr.a.class).get(expr.vairable)[0]*4})`,
        `(i32.add)`, 
        `(i32.load)`
      ];
    }
    case "uniop": {
      const value = codeGenExpr(expr.value, locals, classes, className);
      if (expr.op=="-"){
        return [`(i32.const 0)`, ...value, `(i32.sub)`];
      }
      else{
        return [`(i32.const 1)`, ...value, `i32.xor`];
      }
    }
    case "constructer":
      const classdata = classes.get(expr.name);
      let initVal:Array<string> = [];
      classdata.forEach(([id, val]: [number, Expr<any>], key: string)=>{
        const offset = id*4;
        initVal = [
          ...initVal,
          `(global.get $heap)`,
          `(i32.add (i32.const ${offset}))`,
          ...codeGenExpr(val, locals, classes, className),
          `i32.store`
        ];
      });
      return [
        ...initVal,
        `(global.get $heap)`,
        `(global.set $heap (i32.add (global.get $heap) (i32.const ${classdata.size*4})))`
      ];
    case "methodCall":
      //@ts-ignore
      const objExpr = codeGenExpr(expr.objExpr, locals, classes, className);
      var valStmtss = expr.args.map(e => codeGenExpr(e, locals, classes, className)).flat();
      return [
        ...objExpr,
        `(tee_local $tmpForJudge)`,
        `(get_local $tmpForJudge)`,
        `(i32.const 4)`,
        `(i32.lt_s)`,
        `(if
          (then
            (call $err)
          )
        )`,
        ...valStmtss,
        //@ts-ignore
        `(call $${expr.objExpr.a.class+"$"+expr.method})`
      ]
    case "call":
      const valStmts = expr.args.map(e => codeGenExpr(e, locals, classes, className)).flat();
      let toCall = expr.name;
      if(expr.name === "print") {
        switch(expr.args[0].a) {
          case "bool": toCall = "print_bool"; break;
          case "int": toCall = "print_num"; break;
          case "none": toCall = "print_none"; break;
          default: throw new Error("Unprintable");
        }
        valStmts.push(`(call $${toCall})`);
      }else{
        valStmts.push(`(call $${toCall})`);
      }
      
      return valStmts;
  }
}
export function codeGenStmt(stmt : Stmt<Type>, locals : Env, classes: ClassEnv, className: string) : Array<string> {
  console.log(stmt)
  switch(stmt.tag) {
    case "class":
      const funsCode : string[] = stmt.methods.map(f => codeGenStmt(f, locals, classes, stmt.name)).map(f => f.join("\n"));
      const funs = funsCode.join("\n\n");
      return [funs];
    case "define":
      const withParamsAndVariables = new Map<string, boolean>(locals.entries());

      // Construct the environment for the function body
      const variables = variableNames(stmt.body);
      variables.forEach(v => withParamsAndVariables.set(v, true));
      stmt.params.forEach(p => withParamsAndVariables.set(p.name, true));

      // Construct the code for params and variable declarations in the body
      const params = stmt.params.map(p => `(param $${p.name} i32)`).join(" ");
      const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");

      const stmts = stmt.body.map(s => codeGenStmt(s, withParamsAndVariables, classes, className)).flat();
      const stmtsBody = stmts.join("\n");
      if (className!==""){
        return [`(func $${className+"$"+stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
      }else{
        return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
      }
      
    case "while":
      var valStmts : string[] = []
      var cond = codeGenExpr(stmt.cond, locals, classes, className);
      valStmts.push(`(block $${stmt.cond.tag}_while`)
      valStmts.push(`(loop $${stmt.cond.tag}_loop`)
      valStmts.push(...cond)
      valStmts.push("(i32.const 0)")
      valStmts.push("(i32.eq)") // use result == 0 to check condition
      valStmts.push(`(br_if $${stmt.cond.tag}_while)`)
      const bds = stmt.body.map(s => codeGenStmt(s, locals, classes, className)).flat()
      valStmts.push(...bds)
      valStmts.push(`(br $${stmt.cond.tag}_loop)))`)
      return valStmts;
    case "if":
      var valStmts : string[] = []
      var cond = codeGenExpr(stmt.cond, locals, classes, className);
      var bd1 = stmt.body.map(s => codeGenStmt(s, locals, classes, className)).flat()
      valStmts.push(...cond, `(if `, `(then `, ...bd1, `)`)

      var eicond = codeGenExpr(stmt.eicond, locals, classes, className)
      var eibody = stmt.eibody.map(s => codeGenStmt(s, locals, classes, className)).flat()
      if (eibody.length > 0) valStmts.push(`(else `, ...eicond, `(if `, `(then `, ...eibody, `)`)
      var els = stmt.els.map(s => codeGenStmt(s, locals, classes, className)).flat()
      if (els.length > 0) valStmts.push(`(else `, ...els, ')')
      if (eibody.length > 0) valStmts.push(`))`); // for the second if and first else
      valStmts.push(`)`) // first if
      return valStmts;
    case "pass":
      return []
    case "return":
      var valStmts = codeGenExpr(stmt.value, locals, classes, className);
      valStmts.push("return");
      return valStmts;
    case "varinit":
      var valStmts = codeGenExpr(stmt.init, locals, classes, className);
      if(locals.has(stmt.name)) { valStmts.push(`(local.set $${stmt.name})`); }
      else { valStmts.push(`(global.set $${stmt.name})`); }
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value, locals, classes, className);
      if (stmt.name.tag==="id"){
        if(locals.has(stmt.name.name)) { valStmts.push(`(local.set $${stmt.name})`); }
        else { valStmts.push(`(global.set $${stmt.name.name})`); }
        return valStmts;
      }else if(stmt.name.tag==="getField"){
        const objExpr = codeGenExpr(stmt.name.objExpr, locals, classes, className);
        return [
          ...objExpr,
          //@ts-ignore
          `(i32.const ${classes.get(stmt.name.objExpr.a.class).get(stmt.name.vairable)[0]*4})`,
          `(i32.add)`, 
          ...valStmts,
          `(i32.store)`
        ];
      }else{
        throw new Error("Not id and getField in assign statement");
      }
      
    case "expr":
      const result = codeGenExpr(stmt.expr, locals, classes, className);
      result.push("(local.set $scratch)");
      return result;
  }
}
export function compile(source : string) : string {
  let ast = parseProgram(source);
  ast = tcProgram(ast);
  console.log(ast)
  const emptyEnv = new Map<string, boolean>();
  const classEnv = new Map<string, Map<string, [number, Expr<any>]>>();
  ast.forEach( s=>{
    if (s.tag === "class"){
      var fields = new Map<string, [number, Expr<any>]>();
      var id = 0;
      s.fields.forEach(
        field=>{
          if (field as  {a?: any, tag: "varinit", name: string, type: Type, init: Expr<any> }){
            var newField = (field as  {a?: any, tag: "varinit", name: string, type: Type, init: Expr<any> });
            if (fields.has(newField.name)) throw new Error("Duplicate class field");
            fields.set(newField.name, [id, newField.init]);
            id += 1;
          }
        }
      )
      classEnv.set(s.name, fields);
    }
  });
  const [vars, funs, classes, stmts] = varsFunsStmts(ast);
  const funsCode : string[] = funs.map(f => codeGenStmt(f, emptyEnv, classEnv, "")).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");
  const classesCode : string[] = classes.map(f => codeGenStmt(f, emptyEnv, classEnv, "")).map(f => f.join("\n"));
  const allClasses = classesCode.join("\n\n");
  const varDecls = vars.map(v => `(global $${v} (mut i32) (i32.const 0))`).join("\n");
  console.log(stmts)
  const allStmts = stmts.map(s => codeGenStmt(s, emptyEnv, classEnv, "")).flat();

  const main = [`(local $scratch i32)`, `(local $tmpForJudge i32)`, ...allStmts].join("\n");

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
      (memory (import "imports" "mem") 1)
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      (func $err (import "imports" "err"))
      (global $heap (mut i32) (i32.const 4))
      ${varDecls}
      ${allFuns}
      ${allClasses}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}
