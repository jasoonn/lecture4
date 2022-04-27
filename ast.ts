export type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }
  
export type Parameter<A> =
  | { a?: A, name: string, typ: Type }

export type Stmt<A> =
  | { a?: A, tag: "assign", name: Expr<A>, value: Expr<A> }
  | { a?: A, tag: "varinit", name: string, type: Type, init: Expr<A> }
  | { a?: A, tag: "expr", expr: Expr<A> }
  | { a?: A, tag: "pass"}
  | { a?: A, tag: "while", cond: Expr<A>, body: Stmt<A>[] }
  | { a?: A, tag: "if", cond: Expr<A>, body: Stmt<A>[], eicond: Expr<A>, eibody: Stmt<A>[], els: Stmt<A>[] }
  | { a?: A, tag: "define", name: string, params: Parameter<A>[], ret: Type, body: Stmt<A>[] }
  | { a?: A, tag: "class", name:string, fields: Stmt<A>[], methods: Stmt<A>[] }
  | { a?: A, tag: "return", value: Expr<A> }

export type Expr<A> = 
  | { a?: A, tag: "number", value: number }
  | { a?: A, tag: "true" }
  | { a?: A, tag: "false" }
  | { a?: A, tag: "uniop", op: UniOp, value: Expr<A> }
  | { a?: A, tag: "binop", op: Op, lhs: Expr<A>, rhs: Expr<A> }
  | { a?: A, tag: "id", name: string, global?: boolean }
  | { a?: A, tag: "call", name: string, args: Expr<A>[] }
  | { a?: A, tag: "none"}
  | { a?: A, tag: "getField", objExpr: Expr<A>, vairable: string}
  | { a?: A, tag: "methodCall", objExpr: Expr<A>, method: string, args: Expr<A>[]}
  | { a?: A, tag: "constructer", name: string}


const ops = {"+": true, "-": true, "*": true, "//": true, "%": true, "==": true, "!=": true, "<=": true, ">=": true, "<": true, ">": true, "is": true, "and": true, "or": true};
export type Op = keyof (typeof ops);
export function isOp(maybeOp : string) : maybeOp is Op {
  return maybeOp in ops;
}

const uniop = { "not": true, "-": true }
export type UniOp = keyof (typeof uniop);
export function isUniOp(maybeOp : string) : maybeOp is UniOp {
  return maybeOp in uniop;
}
