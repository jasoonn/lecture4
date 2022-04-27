import { importObject } from "./import-object.test";
import { compile, runn } from '../compiler';

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string) : Type {
  return "none";
}

// Modify run to use `importObject` (imported above) to use for printing
// You can modify `importObject` to have any new fields you need here, or
// within another function in your compiler, for example if you need other
// JavaScript-side helpers
export async function run(source: string) {
  const wat = compile(source);
  //@ts-ignore
  importObject.imports.mem = new WebAssembly.Memory({initial:10, maximum:100});

  await runn(wat, importObject);
  return;
}

type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }

export const NUM : Type = "int";
export const BOOL : Type = "bool";
export const NONE : Type = "none";
export function CLASS(name : string) : Type { 
  return { tag: "object", class: name }
};
