import { type } from "os";
import { getConstantValue } from "typescript";
import { Expr, Stmt, Type, Parameter } from "./ast";

type FunctionsEnv = Map<string, [Type[], Type]>;
type BodyEnv = Map<string, Type>;
type ClassEnv = Map<string, [Map<string, [Type[], Type]>, Map<string, Type>]>;

function assinable (s: Type, t: Type) {
  console.log(s, t);
  if (s === t) return true;
  //cast type
  if ((s as { tag: "object", class: string }).tag === "object") return ((t as { tag: "object", class: string }).tag === "object") && 
                                                                       ((t as { tag: "object", class: string }).class === (s as { tag: "object", class: string }).class);
  if (s === "none") return (t as { tag: "object", class: string }).tag === "object";
  return false;
}

export function tcExpr(e : Expr<any>, functions : FunctionsEnv, variables : BodyEnv, classes : ClassEnv, className : string) : Expr<Type> {
  switch(e.tag) {
    case "none": return { ...e, a: "none" };
    case "number": return { ...e, a: "int" };
    case "true": return { ...e, a: "bool" };
    case "false": return { ...e, a: "bool" };
    case "uniop":{
      const value = tcExpr(e.value, functions, variables, classes, className);
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
          const typedLeft = tcExpr(e.lhs, functions, variables, classes, className)
          const typedRight = tcExpr(e.rhs, functions, variables, classes, className)
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
      else if(e.name==="self"){
        if (className==="") throw new Error("Self not in the class")
        let typ:Type = {tag: "object", class: className};
        return {...e, a: typ};
      }
      else throw new Error(`Not a variable: ${e.name}`)
    case "getField":
      var objExpr = tcExpr(e.objExpr, functions, variables, classes, className);
      var objType = objExpr.a as { tag: "object", class: string };
      if (objType.tag!="object" || !classes.has(objType.class)) throw new Error("Not an object or not have class");
      if (!classes.get(objType.class)[1].has(e.vairable)) throw new Error("Object do not have this variable");
      return {...e, a: classes.get(objType.class)[1].get(e.vairable), objExpr};
    case "methodCall":
      var objExpr = tcExpr(e.objExpr, functions, variables, classes, className);
      var objType = objExpr.a as { tag: "object", class: string };
      if (objType.tag!="object" || !classes.has(objType.class)) throw new Error("Not an object or not have class");
      if (!classes.get(objType.class)[0].has(e.method)) throw new Error("Object do not have this method");
      const [args0, ret0] = classes.get(objType.class)[0].get(e.method);
      const newArgs0 = args0.map((a, i) => {
        const argtyp = tcExpr(e.args[i], functions, variables, classes, className);
        if(a !== argtyp.a) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
        return argtyp
      });
      return {...e, a: ret0,  args: newArgs0, objExpr};
    case "constructer":
      if (classes.has(e.name)){
        let typ:Type = {tag: "object", class: e.name};
        return {...e, a: typ};
      } 
      else throw new Error("Unknow class constructor");
    case "call":
      if(e.name === "print") {
        if(e.args.length !== 1) { throw new Error("print expects a single argument"); }
        const newArgs = [tcExpr(e.args[0], functions, variables, classes, className)];
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
        const argtyp = tcExpr(e.args[i], functions, variables, classes, className);
        if(a !== argtyp.a) { throw new Error(`Got ${argtyp} as argument ${i + 1}, expected ${a}`); }
        return argtyp
      });

      return { ...e, a: ret, args: newArgs };
  }
}

export function tcStmt(s : Stmt<any>, functions : FunctionsEnv, variables : BodyEnv, classes: ClassEnv, className: string, currentReturn : Type) : Stmt<Type> {
  switch(s.tag) {
    case "varinit":
      if (variables.has(s.name))
        throw new Error(`Duplicate declaration of identifier in same scope ${s.name}`)
      const initval = tcExpr(s.init, functions, variables, classes, className);
      if (initval.a !== s.type) 
        throw new Error(`Expected type ${s.type}; got type ${initval.a}`)
        variables.set(s.name, initval.a)
      return { ...s, a: s.type, init: initval }
    case "assign": {
      const rhs = tcExpr(s.value, functions, variables, classes, className);
      const lhs = tcExpr(s.name, functions, variables, classes, className);
      if (!assinable(lhs.a, rhs.a)) throw new Error("Invalid Assign");
      return { ...s, name: lhs, value: rhs };
    }
    case "define": {
      const bodyvars = new Map<string, Type>(variables.entries());
      s.params.forEach(p => { bodyvars.set(p.name, p.typ)});
      const newStmts = s.body.map(bs => tcStmt(bs, functions, bodyvars, classes, className, s.ret));
      return { ...s, body: newStmts };
    }
    case "class":
      let fields: Stmt<Type>[] = [];
      fields = s.fields.map(
        field=>(tcStmt(field, functions, variables, classes, s.name, currentReturn))
      );
      let methods = s.methods.map(
        method=>(tcStmt(method, functions, variables, classes, s.name, currentReturn))
      );
      return { ...s, fields, methods };
    case "while": {
      const cond = tcExpr(s.cond, functions, variables, classes, className);
      if (cond.a !== "bool")
        throw new Error(`Condition expression cannot be of type ${cond.a}`)
      const stmts = s.body.map(bd => tcStmt(bd, functions, variables, classes, className, currentReturn));
      return { ...s, cond: cond, body: stmts }
    }
    case "pass": 
      return { ...s, a: "none" }
    case "if": {
      const cond = tcExpr(s.cond, functions, variables, classes, className)
      if (cond.a !== "bool")
        throw new Error(`Condition expression cannot be of type ${cond.a}`)
      const bd1 = s.body.map(bd => tcStmt(bd, functions, variables, classes, className, currentReturn));
      let eicond : Expr<Type> = { a: "bool", tag: "false" }
      let eibody : Stmt<Type>[] = []
      if (s.eibody.length > 0) {
        // got eicond and body
        eicond = tcExpr(s.eicond, functions, variables, classes, className);
        eibody = s.eibody.map(bd => tcStmt(bd, functions, variables, classes, className, currentReturn));
      }
      let els : Stmt<Type>[] = s.els.map(bd => tcStmt(bd, functions, variables, classes, className, currentReturn))
      return { ...s, cond: cond, body: bd1, eicond: eicond, eibody: eibody, els: els }
    }
    case "expr": {
      const ret = tcExpr(s.expr, functions, variables, classes, className);
      return { ...s, expr: ret };
    }
    case "return": {
      console.log(s)
      const valTyp = tcExpr(s.value, functions, variables, classes, className);
      if(valTyp.a !== currentReturn) {
        throw new Error(`${valTyp} returned but ${currentReturn} expected.`);
      }
      return { ...s, value: valTyp };
    }
  }
}

export function tcProgram(p : Stmt<any>[]) : Stmt<Type>[] {
  const functions = new Map<string, [Type[], Type]>();
  const classes = new Map<string, [Map<string, [Type[], Type]>, Map<string, Type>]>();
  p.forEach(s => {
    if(s.tag === "define") {
      functions.set(s.name, [s.params.map(p => p.typ), s.ret]);
    }
    if (s.tag === "class"){
      var methods = new Map<string, [Type[], Type]>();
      s.methods.forEach(
        method=>{
          if (method as {tag: "define", name: string, params: Parameter<any>[], ret: Type, body: Stmt<any>[] }){
            var newMethod = (method as {a?: any, tag: "define", name: string, params: Parameter<any>[], ret: Type, body: Stmt<any>[] })
            methods.set(newMethod.name, [newMethod.params.map(p=>p.typ), newMethod.ret]);
          }else throw new Error("Class method field is not method");
        }
      )
      var fields = new Map<string, Type>();
      s.fields.forEach(
        field=>{
          if (field as  {a?: any, tag: "varinit", name: string, type: Type, init: Expr<any> }){
            var newField = (field as  {a?: any, tag: "varinit", name: string, type: Type, init: Expr<any> });
            if (fields.has(newField.name)) throw new Error("Duplicate class field");
            fields.set(newField.name, newField.type);
          }
        }
      )
      classes.set(s.name, [methods, fields]);
    }
  });
  

  const globals = new Map<string, Type>();
  return p.map(s => {
    if(s.tag === "varinit") {
      //return tcStmt(s, functions, globals, "none");
      
      const value = tcExpr(s.init, functions, globals, classes, "");
      if (!assinable(value.a, s.type)) throw new Error("Var init do not match");
      globals.set(s.name, s.type);
      return { ...s, a: s.type, init: value };
    }
    else {
      const res = tcStmt(s, functions, globals, classes, "", "none");
      return res;
    }
  });
}