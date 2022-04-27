import { TreeCursor } from 'lezer';
import {parser} from 'lezer-python';
import {Parameter, Stmt, Expr, Type, isOp, isUniOp} from './ast';

function isVarinit(stmt: Stmt<any>) : Boolean {
  return stmt.tag === "varinit";
}

function isFunDef(stmt: Stmt<any>) : Boolean {
  return stmt.tag === "define";
}

export function parseProgram(source : string) : Array<Stmt<any>> {
  const t = parser.parse(source).cursor();
  return traverseStmts(source, t);
}

export function traverseStmts(s : string, t : TreeCursor) {
  // The top node in the program is a Script node with a list of children
  // that are various statements
  t.firstChild();
  const stmts = [];
  do {
    stmts.push(traverseStmt(s, t));
  } while(t.nextSibling()); // t.nextSibling() returns false when it reaches
                            //  the end of the list of children
  return stmts;
}

/*
  Invariant – t must focus on the same node at the end of the traversal
*/
export function traverseStmt(s : string, t : TreeCursor) : Stmt<any> {
  switch(t.type.name) {
    case "ReturnStatement":
      t.firstChild();  // Focus return keyword
      t.nextSibling(); // Focus expression
      var value = traverseExpr(s, t);
      t.parent();
      return { tag: "return", value };
    case "AssignStatement":
      t.firstChild(); // focused on name (the first child)
      var name = traverseExpr(s, t);
      t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
      //@ts-ignore
      if (t.type.name == "TypeDef") {
        t.firstChild();
        t.nextSibling();
        var typeName = s.substring(t.from, t.to);
        t.parent()
        t.nextSibling(); // assignop
        t.nextSibling(); // value
        var value = traverseExpr(s, t);
        t.parent();
        var realName = (name as {tag: "id", name: string})
        if (typeName!=="none"&&typeName!=="int"&&typeName!=="bool") return { tag: "varinit", name: realName.name, type: <Type> { tag: "object", class: typeName }, init: value};
        else return { tag: "varinit", name: realName.name, type: <Type> typeName, init: value};
      }
        
      t.nextSibling(); // focused on the value expression

      var value = traverseExpr(s, t);
      t.parent();
      return { tag: "assign", name, value };
    case "ExpressionStatement":
      t.firstChild(); // The child is some kind of expression, the
                      // ExpressionStatement is just a wrapper with no information
      var expr = traverseExpr(s, t);
      t.parent();
      return { tag: "expr", expr: expr };
    case "FunctionDefinition":
      t.firstChild();  // Focus on def
      t.nextSibling(); // Focus on name of function
      var name1 = s.substring(t.from, t.to);
      t.nextSibling(); // Focus on ParamList
      var params = traverseParameters(s, t)
      t.nextSibling(); // Focus on Body or TypeDef
      let ret : Type = "none";
      let maybeTD = t;
      if(maybeTD.type.name === "TypeDef") {
        t.firstChild();
        ret = traverseType(s, t);
        t.parent();
      }
      t.nextSibling(); // Focus on single statement (for now)
      t.firstChild();  // Focus on :
      const body = [];
      while(t.nextSibling()) {
        body.push(traverseStmt(s, t));
      }
      t.parent();      // Pop to Body
      t.parent();      // Pop to FunctionDefinition
      return {
        tag: "define",
        name: name1, params, body, ret
      }
    case "ClassDefinition":
      t.firstChild(); //class
      t.nextSibling(); // class name
      const className = s.substring(t.from, t.to);
      t.nextSibling(); //inheritance? skip for now
      t.nextSibling(); //body
      t.firstChild();  //:
      const classBody = [];
      const classFields : Stmt<any>[] = [];
      const classMethods : Stmt<any>[] = [];
      while (t.nextSibling()) {
        classBody.push(traverseStmt(s, t));
      }
      classBody.map(s => {
        if (isVarinit(s)) {
          classFields.push(s);
        }
        else if (isFunDef(s)) {
          classMethods.push(s);
        }
        else {
          throw new Error("Parse Error: Only var def and method def allowed in class def");
        }
      });
      t.parent(); //body
      t.parent(); //class def
      return {
        tag: "class",
        name: className,
        fields: classFields,
        methods: classMethods
      }
    case "WhileStatement":
      t.firstChild() // while
      t.nextSibling() //cond
      const cond = traverseExpr(s, t);
      t.nextSibling() //body
      t.firstChild() //:
      const stmts = [];
      while (t.nextSibling()) {
        stmts.push(traverseStmt(s, t));
      }
      t.parent() // to body
      t.parent() // to while
      return {
        tag: "while",
        cond: cond,
        body: stmts
      }
    case "PassStatement":
      return {
        tag: "pass"
      }
    case "IfStatement":
      t.firstChild() // if
      t.nextSibling() // cond
      const ifcond = traverseExpr(s, t);
      t.nextSibling() // body1
      t.firstChild() // :
      if (s.substring(t.from, t.to) !== ":") throw new Error(`Parse error near token ${s.substring(t.from, t.to)}`)
      const bd1 = [];
      while (t.nextSibling()) {
        bd1.push(traverseStmt(s, t));
      }
      t.parent() // body1
      t.nextSibling()
      let eicond : Expr<any> = {tag: "false"}
      let eibody = []
      let maybeElif = t
      if (maybeElif.type.name == "elif") {
        t.nextSibling() // eicond
        eicond = traverseExpr(s, t);
        t.nextSibling() // eibody
        t.firstChild()  // :
        if (s.substring(t.from, t.to) !== ":") throw new Error(`Parse error near token ${s.substring(t.from, t.to)}`)
        while (t.nextSibling()) {
          eibody.push(traverseStmt(s, t));
        }

        t.parent() // body
        t.nextSibling() 
      }
      let elsbody = []
      let maybeEls = t
      if (maybeEls.type.name == "else") {
        t.nextSibling() // elsbody
        t.firstChild()  // :
        while (t.nextSibling()) {
          elsbody.push(traverseStmt(s, t));
        }
        t.parent()
      }
      t.parent()
      return {
        tag: "if",
        cond: ifcond,
        body: bd1,
        eicond: eicond,
        eibody: eibody,
        els: elsbody
      }
  }
}

export function traverseType(s : string, t : TreeCursor) : Type {
  switch(t.type.name) {
    case "VariableName":
      const name = s.substring(t.from, t.to);
      //@ts-ignore
      if(name !== "int" || name !== "bool") {
        const newTyp : Type = { tag: "object", class: name };
        return newTyp;
      }
      return name;
    default:
      throw new Error("Unknown type: " + t.type.name)

  }
}

export function traverseParameters(s : string, t : TreeCursor) : Parameter<any>[] {
  t.firstChild();  // Focuses on open paren
  const parameters = []
  t.nextSibling(); // Focuses on a VariableName
  while(t.type.name !== ")") {
    let name = s.substring(t.from, t.to);
    t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake
    let nextTagName = t.type.name; // NOTE(joe): a bit of a hack so the next line doesn't if-split
    if(nextTagName !== "TypeDef") { throw new Error("Missed type annotation for parameter " + name)};
    t.firstChild();  // Enter TypeDef
    t.nextSibling(); // Focuses on type itself
    let typ = traverseType(s, t);
    t.parent();
    t.nextSibling(); // Move on to comma or ")"
    parameters.push({name, typ});
    t.nextSibling(); // Focuses on a VariableName
  }
  t.parent();       // Pop to ParamList
  return parameters;
}

export function traverseExpr(s : string, t : TreeCursor) : Expr<any> {
  switch(t.type.name) {
    
    case "None":
      return { tag: "none" };
    case "Boolean":
      if(s.substring(t.from, t.to) === "True") { return { tag: "true" }; }
      else { return { tag: "false" }; }
    case "Number":
      return { tag: "number", value: Number(s.substring(t.from, t.to)) };
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) };
    case "CallExpression":
      t.firstChild(); //Focus on name or callexpression
      let maybeTD = t;
      if (maybeTD.type.name==="MemberExpression"){
        var firstExpr = traverseExpr(s, t); //MemberExpression
        if (t.nextSibling()){ //ArgList
          var args = traverseArguments(t, s);
          if (firstExpr as {tag: "getField", objExpr: Expr<any>, vairable: string}){
            const expr = (firstExpr as {tag: "getField", objExpr: Expr<any>, vairable: string});
            const result: Expr<any> =  {tag: "methodCall", objExpr: expr.objExpr, method: expr.vairable, args};
            t.parent();
            return result;
          }else{
            throw new Error("CallExpression weird");
          }
        }else{
          t.parent();
          return firstExpr;
        }
      }else{
        var name = s.substring(t.from, t.to);
        if (name==="print") {
          t.nextSibling(); // Focus ArgList
          var args = traverseArguments(t, s);
          t.parent();
          return {tag: "call", name, args: args};
        }
        t.nextSibling();
        let maybeTD = t;
        if (maybeTD.type.name!=="ArgList") throw new Error("Not () in constructor");
        t.parent();
        return  {tag: "constructer", name};
      }
      // t.firstChild(); // Focus name
      // var name = s.substring(t.from, t.to);
      // t.nextSibling(); // Focus ArgList
      // t.firstChild(); // Focus open paren
      // var args = traverseArguments(t, s);
      // var result : Expr<any> = { tag: "call", name, args: args};
      // t.parent();
      // return result;
    case "MemberExpression":
      t.firstChild(); //First field
      var firstExpr = traverseExpr(s, t);
      t.nextSibling(); //.
      t.nextSibling(); //name
      var name = s.substring(t.from, t.to);
      t.parent();
      return {
        tag: "getField", objExpr: firstExpr, vairable: name
      }
    case "UnaryExpression":
      t.firstChild(); //go to op
      var opStr = s.substring(t.from, t.to);
      if(!isUniOp(opStr)) {
        throw new Error(`Unknown or unhandled uniop: ${opStr}`);
      }
      t.nextSibling();//go to value
      const value = traverseExpr(s, t);
      t.parent();
      return {
        tag: "uniop",
        op: opStr,
        value
      }
    case "ParenthesizedExpression":
      t.firstChild(); //go to (
      t.nextSibling();
      const expr = traverseExpr(s, t);
      t.parent();
      return expr;
    case "BinaryExpression":
      t.firstChild(); // go to lhs
      const lhsExpr = traverseExpr(s, t);
      t.nextSibling(); // go to op
      var opStr = s.substring(t.from, t.to);
      if(!isOp(opStr)) {
        throw new Error(`Unknown or unhandled biop: ${opStr}`);
      }
      t.nextSibling(); // go to rhs
      const rhsExpr = traverseExpr(s, t);
      t.parent();
      return {
        tag: "binop",
        op: opStr,
        lhs: lhsExpr,
        rhs: rhsExpr
      };
  
  }
}

export function traverseArguments(c : TreeCursor, s : string) : Expr<any>[] {
  c.firstChild();  // Focuses on open paren
  const args = [];
  c.nextSibling();
  while(c.type.name !== ")") {
    let expr = traverseExpr(s, c);
    args.push(expr);
    c.nextSibling(); // Focuses on either "," or ")"
    c.nextSibling(); // Focuses on a VariableName
  } 
  c.parent();       // Pop to ArgList
  return args;
}