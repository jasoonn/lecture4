import {compile, runn} from './compiler';

// command to run:
// node node-main.js 987
const input = process.argv[2];
const result = compile(input);
console.log(result);
runn(result, {}).then((value) => {
  console.log(value);
});

