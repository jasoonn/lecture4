import { type } from "os";
import { getConstantValue } from "typescript";
import { Expr, Stmt, Type } from "./ast";

type FunctionsEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;

function assinable (s: Type, t: Type) {
  if (s === t) return true;
  //cast type
  if ((s as { tag: "object", class: string }).tag === "object") return ((t as { tag: "object", class: string }).tag === "object") && 
                                                                       ((t as { tag: "object", class: string }).class === (s as { tag: "object", class: string }).class);
  if (s === "none") return (t as { tag: "object", class: string }).tag === "object";
  return false;
}

export function tcExpr(e : Expr<any>, functions : FunctionsEnv, variables : BodyEnv) : Expr<Type> {
  switch(e.tag) {
    case "none": return { ...e, a: "none" };
    case "number": return { ...e, a: "int" };
    case "true": return { ...e, a: "bool" };
    case "false": return { ...e, a: "bool" };
    case "uniop":{
      const value = tcExpr(e.value, functions, variables);
      switch(e.op){
        case "not":
          if (value.a!=="bool" ) throw new Error("TYPE ERROR in uniop");
          return {...e, a: "bool"};
        case "-":
          if (value.a!=="int" ) throw new Error("TYPE ERROR in uniop");
          return {...e, a: "int"};
        default: throw new Error(`Unhandled unary op`);
      }
    }
    case "binop": {
      switch(e.op) {
        case "+": 
        case "-": 
        case "*": 
        case "//":
        case "%":
        case "==":
        case "!=":
        case ">=":
        case "<=":
        case ">":
        case "<":
          const typedLeft = tcExpr(e.lhs, functions, variables)
          const typedRight = tcExpr(e.rhs, functions, variables)
          if (typedLeft.a !== "int" || typedRight.a !== "int")
            throw new Error(`TYPE ERROR: cannot apply operator ${e.op} on types ${typedLeft.a} and ${typedRight.a}`)
          let typ : Type = "bool"
          if (e.op == "+" || e.op == "-" || e.op == "*" || e.op == "//" || e.op == "%")
            typ = "int"
          return { ...e, a: typ };
        case "is":
        case "and":
        case "or":
          return { ...e, a: "bool" };
        default: throw new Error(`Unhandled binary op`)
      }
    }
    case "id": 
      if(variables.has(e.name)) return { ...e, a: variables.get(e.name) };
      else throw new Error(`Not a variable: ${e.name}`)
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

export function tcStmt(s : Stmt<any>, functions : FunctionsEnv, variables : BodyEnv, currentReturn : Type) : Stmt<Type> {
  switch(s.tag) {
    case "varinit":
      if (variables.has(s.name))
        throw new Error(`Duplicate declaration of identifier in same scope ${s.name}`)
      const initval = tcExpr(s.init, functions, variables);
      if (initval.a !== s.type) 
        throw new Error(`Expected type ${s.type}; got type ${initval.a}`)
        variables.set(s.name, initval.a)
      return { ...s, a: s.type, init: initval }
    case "assign": {
      const rhs = tcExpr(s.value, functions, variables);
      if(variables.has(s.name) && variables.get(s.name) !== rhs.a) {
        throw new Error(`Cannot assign ${rhs} to ${variables.get(s.name)}`);
      } else if (!variables.has(s.name)) {
        throw new Error(`Not a variable: ${s.name}`)
      }
      else {
        variables.set(s.name, rhs.a);
      }
      return { ...s, value: rhs };
    }
    case "define": {
      const bodyvars = new Map<string, Type>(variables.entries());
      s.params.forEach(p => { bodyvars.set(p.name, p.typ)});
      const newStmts = s.body.map(bs => tcStmt(bs, functions, bodyvars, s.ret));
      return { ...s, body: newStmts };
    }
    case "class":

      return { ...s };
    case "while": {
      const cond = tcExpr(s.cond, functions, variables);
      if (cond.a !== "bool")
        throw new Error(`Condition expression cannot be of type ${cond.a}`)
      const stmts = s.body.map(bd => tcStmt(bd, functions, variables, currentReturn));
      return { ...s, cond: cond, body: stmts }
    }
    case "pass": 
      return { ...s, a: "none" }
    case "if": {
      const cond = tcExpr(s.cond, functions, variables)
      if (cond.a !== "bool")
        throw new Error(`Condition expression cannot be of type ${cond.a}`)
      const bd1 = s.body.map(bd => tcStmt(bd, functions, variables, currentReturn));
      let eicond : Expr<Type> = { a: "bool", tag: "false" }
      let eibody : Stmt<Type>[] = []
      if (s.eibody.length > 0) {
        // got eicond and body
        eicond = tcExpr(s.eicond, functions, variables);
        eibody = s.eibody.map(bd => tcStmt(bd, functions, variables, currentReturn));
      }
      let els : Stmt<Type>[] = s.els.map(bd => tcStmt(bd, functions, variables, currentReturn))
      return { ...s, cond: cond, body: bd1, eicond: eicond, eibody: eibody, els: els }
    }
    case "expr": {
      const ret = tcExpr(s.expr, functions, variables);
      return { ...s, expr: ret };
    }
    case "return": {
      console.log(s)
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
      //return tcStmt(s, functions, globals, "none");
      
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