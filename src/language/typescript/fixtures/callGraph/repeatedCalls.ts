import { greet } from './callee';

export function run() {
  greet('hello');
  greet('world');
}
