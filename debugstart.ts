import { stringifyTree } from "./treeprinter";
import { parseProgram } from "./parser";
import {parser} from "lezer-python";
import { tcProgram } from "./tc";

const source1 = "def f(a : int) -> int:\n b : int = 2\n return a + b\nx : int = 5\nf(x)"
const source = "class Rat(object):\n n : int = 456\n d : int = 789\n def __init__(c : bool, self: Rat, n: int, d: int) -> Rat:\n  self.n = n\n  self.d = d\n  return self\nr1 : Rat = None\na : int = 0"
const source2 = "1+2\n-2"
const t = parser.parse(source2);
console.log(stringifyTree(t.cursor(),source2,0));
var ast = parseProgram(source2)
console.log(ast)
//ast = tcProgram(ast)
//console.log(ast)