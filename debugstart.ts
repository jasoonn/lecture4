import { stringifyTree } from "./treeprinter";
import { parseProgram } from "./parser";
import {parser} from "lezer-python";
import { tcProgram } from "./tc";
import {compile} from "./compiler"

const source1 = "def f(a : int) -> int:\n b : int = 2\n return a + b\nx : int = 5\nf(x)"
//const source = "class Rat(object):\n d : int = 789\n def printt():\n print(self.d)\nr1 : Rat = None\n"
//def __init__(c : bool, self: Rat, n: int, d: int) -> Rat:\n  self.n = n\n  self.d = d\n  return self\nC().new(42).clear()\nhaha.cool()\nhaha.coo\n Rat()\nr1.d = 5
const source = `
class C(object):
  x : int = 1
  y : int = 2

class D(object):
  y : int = 3
  x : int = 4
c : C = None
d : D = None
c = C()
d = D()
print(c.x)
print(d.x)
`
const t = parser.parse(source);
console.log(stringifyTree(t.cursor(),source,0));
var ast = parseProgram(source)
var coo = tcProgram(ast);
var haha = compile(source);
// console.log(ast)
//ast = tcProgram(ast)
console.log(ast)
console.log(haha)