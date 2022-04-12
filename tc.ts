import { createEmitAndSemanticDiagnosticsBuilderProgram } from "typescript";
import { Expr, Stmt, Type} from "./ast";

type FunctionsEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;

export function tcExpr(e : Expr<any>, functions : FunctionsEnv, variables : BodyEnv) : Expr<Type> {
  switch(e.tag) {
    case "number": return { ...e, a: "int" };
    case "true": return { ...e, a: "bool" };
    case "false": return { ...e, a: "bool" };
    case "none": return {...e, a:"none"}
    case "binop": {
      var lhs = tcExpr(e.lhs, functions, variables);
      var rhs = tcExpr(e.rhs, functions, variables);
      if (lhs.a!=rhs.a) { throw new Error("Cannot apply operator "+e.op+" on types "+lhs.a+" and "+rhs.a); }
      switch(e.op) {
        case "+": return { ...e, lhs, rhs, a: "int" };
        case "-": return { ...e, lhs, rhs, a: "int" };
        case ">": return { ...e, lhs, rhs, a: "bool" };
        case "and": return { ...e, lhs, rhs, a: "bool" };
        case "or": return { ...e, lhs, rhs, a: "bool" };
        case "*": return { ...e, lhs, rhs, a: "int" };
        case "//": return { ...e, lhs, rhs, a: "int" };
        case "%": return { ...e, lhs, rhs, a: "int" };
        case "==": return { ...e, lhs, rhs, a: "bool" };
        case "!=": return { ...e, lhs, rhs, a: "bool" };
        case "<=": return { ...e, lhs, rhs, a: "bool" };
        case ">=": return { ...e, lhs, rhs, a: "bool" };
        case "<": return { ...e, lhs, rhs, a: "bool" };
        case "is": return { ...e, lhs, rhs, a: "bool" };
        default: throw new Error(`Unhandled op ${e.op}`)
      }
    }
    case "id": return { ...e, a: variables.get(e.name) };
    case "call":
      if(e.name === "print") {
        if(e.args.length !== 1) { throw new Error("print expects a single argument"); }
        const newArgs = [tcExpr(e.args[0], functions, variables)];
        const res : Expr<Type> = { ...e, a: "none", args: newArgs } ;
        return res;
      }
      if(!functions.has(e.name)) {
        throw new Error(`function ${e.name} not found`);
      }

      const [args, ret] = functions.get(e.name);
      if(args.length !== e.args.length) {
        throw new Error(`Expected ${args.length} arguments but got ${e.args.length}`);
      }

      const newArgs = args.map((a, i) => {
        const argtyp = tcExpr(e.args[i], functions, variables);
        if(a !== argtyp.a) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
        return argtyp
      });

      return { ...e, a: ret, args: newArgs };
  }
}


function duplicateEnv(env : BodyEnv) : BodyEnv{
  return new Map(env);
}

function duplicateFunc(functions: FunctionsEnv): FunctionsEnv{
  return new Map(functions);
}



export function tcStmts( stmts: Stmt<any>[], functions : FunctionsEnv, variables : BodyEnv) : Stmt<Type>[]{
  stmts.forEach(stmt => {
    tcStmt(stmt, functions, variables, "none");
  })
  return [];
}


// export function tcCheckVarDefs(defs: VarDef<any>[], variables : BodyEnv): VarDef<Type>[]{
//   const typedDefs : VarDef<Type>[] = []; 
//   defs.forEach((def) => {
//     const typedDef = tcLiteral(def.init);
//     if (typedDef.a !== def.typedVar.type) throw new Error("Type Error: init type does not match literal type")
//     variables.set(def.typedVar.name, def.typedVar.type);
//     typedDefs.push({...def, a: def.typedVar.type, init: typedDef});
//   })
//   return typedDefs;
// }

// export function tcFunDef(func: FuncDef<any>, variables : BodyEnv, functions : FunctionsEnv): FuncDef<Type>{
//   const localVariables = duplicateEnv(variables);
//   // add params to env
//   func.params.forEach(param => {
//     localVariables.set(param.name, param.type);
//   })
//   // check inits
//   // add inits to env
//   const typedInits = tcCheckVarDefs(func.inits, variables);
//   func.inits.forEach(init => {
//     localVariables.set(init.typedVar.name, init.typedVar.type);
//   })
//   // add func type to funEnv
//   const localFunctions = duplicateFunc(functions);
//   localFunctions.set(func.name, [func.params.map(param=> param.type), func.ret])
  
//   // check body
//   const typedStmts = tcStmts(func.body, localFunctions, localVariables);
//   // make sure every path has the expected return type
//   return {...func, inits: typedInits, body: typedStmts}
// }

export function tcStmt(s : Stmt<any>, functions : FunctionsEnv, variables : BodyEnv, currentReturn : Type) : Stmt<Type> {
  switch(s.tag) {
    case "while": {
      const cond = tcExpr(s.cond, functions, variables);
      if (cond.a!=="bool") throw new Error("Condition expression cannot be type of "+cond.a);
      const stmtBody = s.stmtBody.map(bs => tcStmt(bs, functions, variables, currentReturn));
      return {...s, cond, stmtBody};
    }
    case "var":{
      const literal = tcExpr(s.literal, functions, variables);
      //todo check type
      variables.set(s.name, literal.a);
      return {...s, literal};
    }
    case "assign": {
      const rhs = tcExpr(s.value, functions, variables);
      if(variables.has(s.name) ) {
        if (variables.get(s.name) !== rhs.a) throw new Error(`Cannot assign ${rhs} to ${variables.get(s.name)}`);
      }
      else { throw new Error(`Not a variable ${s.name}`);}
      return { ...s, value: rhs };
    }
    case "if": {
      const cond = tcExpr(s.cond, functions, variables);
      if (cond.a!=="bool") throw new Error("cond in if is not boolean");
      const ifBody = s.ifBody.map(bs => tcStmt(bs, functions, variables, currentReturn));
      if (s.elseIfBody!==undefined) {
        const elseIfCond = tcExpr(s.elseIfCond, functions, variables);
        if (elseIfCond.a!=="bool") throw new Error("cond in elif is not boolean");
        const elseIfBody = s.elseIfBody.map(bs => tcStmt(bs, functions, variables, currentReturn));
        if (s.elseBody!==undefined){
          const elseBody = s.elseBody.map(bs => tcStmt(bs, functions, variables, currentReturn));
          return {...s, cond, ifBody, elseIfCond, elseIfBody, elseBody};
        }else {
          return {...s, cond, ifBody, elseIfCond, elseIfBody};
        }
      }
      if (s.elseBody!==undefined) {
        const elseBody = s.elseBody.map(bs => tcStmt(bs, functions, variables, currentReturn));
        return {...s, cond, ifBody, elseBody};
      }else{
        return {...s, cond, ifBody};
      }
    }
    case "define": {
      const bodyvars = new Map<string, Type>(variables.entries());
      s.params.forEach(p => { bodyvars.set(p.name, p.typ)});
      const newStmts = s.body.map(bs => tcStmt(bs, functions, bodyvars, s.ret));
      return { ...s, body: newStmts };
    }
    case "expr": {
      const ret = tcExpr(s.expr, functions, variables);
      return { ...s, expr: ret };
    }
    case "return": {
      const valTyp = tcExpr(s.value, functions, variables);
      if(valTyp.a !== currentReturn) {
        throw new Error(`${valTyp} returned but ${currentReturn} expected.`);
      }
      return { ...s, value: valTyp };
    }
  }
}

export function tcProgram(p : Stmt<any>[]) : Stmt<Type>[] {
  const functions = new Map<string, [Type[], Type]>();
  p.forEach(s => {
    if(s.tag === "define") {
      functions.set(s.name, [s.params.map(p => p.typ), s.ret]);
    }
  });

  const globals = new Map<string, Type>();
  return p.map(s => {
    if(s.tag === "assign") {
      const rhs = tcExpr(s.value, functions, globals);
      globals.set(s.name, rhs.a);
      return { ...s, value: rhs };
    }
    else {
      const res = tcStmt(s, functions, globals, "none");
      return res;
    }
  });
}