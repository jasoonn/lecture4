import { Expr, Stmt, Type } from "./ast";

type FunctionsEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;

export function tcExpr(e : Expr<any>, functions : FunctionsEnv, variables : BodyEnv) : Expr<Type> {
  switch(e.tag) {
    case "number": return { a: "int", ...e };
    case "true": return { a: "bool", ...e };
    case "false": return { a: "bool", ...e };
    case "binop": {
      switch(e.op) {
        case "+": return { a: "int", ...e };
        case "-": return { a: "int", ...e };
        case ">": return { a: "bool", ...e };
        case "and": return { a: "bool", ...e };
        case "or": return { a: "bool", ...e };
        default: throw new Error(`Unhandled op ${e.op}`)
      }
    }
    case "id": return { a: variables.get(e.name), ...e };
    case "call":
      if(!functions.has(e.name)) {
        throw new Error(`function ${e.name} not found`);
      }

      const [args, ret] = functions.get(e.name);
      if(args.length !== e.arguments.length) {
        throw new Error(`Expected ${args.length} arguments but got ${e.arguments.length}`);
      }

      const newArgs = args.map((a, i) => {
        const argtyp = tcExpr(e.arguments[i], functions, variables);
        if(a !== argtyp.a) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
        return argtyp
      });

      return { a: ret, arguments: newArgs, ...e };
  }
}

export function tcStmt(s : Stmt<any>, functions : FunctionsEnv, variables : BodyEnv, currentReturn : Type) : Stmt<Type> {
  switch(s.tag) {
    case "assign": {
      const rhs = tcExpr(s.value, functions, variables);
      if(variables.has(s.name) && variables.get(s.name) !== rhs.a) {
        throw new Error(`Cannot assign ${rhs} to ${variables.get(s.name)}`);
      }
      else {
        variables.set(s.name, rhs.a);
      }
      return { value: rhs, ...s };
    }
    case "define": {
      const bodyvars = new Map<string, Type>(variables.entries());
      s.parameters.forEach(p => { bodyvars.set(p.name, p.typ)});
      const newStmts = s.body.forEach(bs => tcStmt(bs, functions, bodyvars, s.ret));
      return { body: newStmts, ...s };
    }
    case "expr": {
      const ret = tcExpr(s.expr, functions, variables);
      return { expr: ret, ...s };
    }
    case "return": {
      const valTyp = tcExpr(s.value, functions, variables);
      if(valTyp.a !== currentReturn) {
        throw new Error(`${valTyp} returned but ${currentReturn} expected.`);
      }
      return { value: valTyp, ...s };
    }
  }
}

export function tcProgram(p : Stmt<any>[]) : Stmt<A>[] {
  const functions = new Map<string, [Type[], Type]>();
  p.forEach(s => {
    if(s.tag === "define") {
      functions.set(s.name, [s.parameters.map(p => p.typ), s.ret]);
    }
  });

  const globals = new Map<string, Type>();
  return p.map(s => {
    if(s.tag === "assign") {
      const rhs = tcExpr(s.value, functions, globals);
      globals.set(s.name, rhs.a);
      return { value: rhs, ...s };
    }
    else {
      return tcStmt(s, functions, globals, "none");
    }
  });
}