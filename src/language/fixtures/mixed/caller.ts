import { greet } from './callee';

export function run(): void {
  greet('world');
}
