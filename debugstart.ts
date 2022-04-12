import { stringifyTree } from "./treeprinter";
import { parseProgram } from "./parser";
import {parser} from "lezer-python";
import {tcProgram} from "./tc"
import {compile} from "./compiler"

//const source = "(5)\n(6)";
//const source = "a=2\nwhile(a>0):\n print(a)\n a=a-1\n" ;
//const source = "a = 2\na = a-1\nprint(a)"
const source= "None \n none\n"

const t = parser.parse(source);
console.log(stringifyTree(t.cursor(),source,0));
// const out = compiler.compile(source);
// console.log(out);
var a = parseProgram(source)
console.log(a)
var b = tcProgram(a)
console.log(b)

// a = 2
// while (2>a):
//   print(a)
//   a = a-1
