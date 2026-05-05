/**
 * Tests for Java call graph source parser — extracts declarations and calls from Java source.
 *
 * From: features/java-call-graph.feature
 */

import { describe, it, expect } from 'vitest';
import { parseJavaSource } from './callGraphParse';

describe('parseJavaSource', () => {
  describe('Scenario: Extract method declarations', () => {
    it('should extract a public method with its class name and 0-based line', () => {
      const source = `package com.example;

public class Service {
    public void processOrder(String orderId) {
        // body
    }
}`;
      const result = parseJavaSource(source);

      expect(result.className).toBe('Service');
      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('processOrder');
      expect(result.methods[0].line).toBe(3); // 0-based line of method decl
    });

    it('should extract multiple methods from a class', () => {
      const source = `public class Service {
    public void processOrder(String id) {
    }
    public void validate(String input) {
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(2);
      expect(result.methods[0].name).toBe('processOrder');
      expect(result.methods[0].line).toBe(1);
      expect(result.methods[1].name).toBe('validate');
      expect(result.methods[1].line).toBe(3);
    });

    it('should extract static methods', () => {
      const source = `public class Util {
    public static String format(String value) {
        return value.trim();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('format');
    });

    it('should compute endLine from closing brace', () => {
      const source = `public class Foo {
    public void bar() {
        int x = 1;
        int y = 2;
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods[0].endLine).toBe(4); // 0-based line of closing }
    });

    it('should include all body lines when method body contains a closing brace inside a string literal', () => {
      const source = `public class Foo {
    public void foo() {
        String s = "}";
        doWork();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].endLine).toBe(4); // 0-based line of method's closing }
      expect(result.methods[0].bodyLines).toEqual([
        '        String s = "}";',
        '        doWork();',
      ]);
    });

    it('should compute correct endLine when method body contains an opening brace in a line comment', () => {
      const source = `public class Foo {
    public void foo() {
        // if (condition) {
        doWork();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].endLine).toBe(4); // real closing } of method (0-based)
    });

    it('should extract public synchronized methods', () => {
      const source = `public class Service {
    public synchronized void run() {
        doWork();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('run');
    });

    it('should not treat constructors as methods', () => {
      const source = `public class Service {
    public Service(Repository repo) {
        this.repo = repo;
    }
    public void run() {
    }
}`;
      const result = parseJavaSource(source);

      // Constructor should not appear; only run() should
      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('run');
    });
  });

  describe('Scenario: Extract field declarations', () => {
    it('should extract typed fields', () => {
      const source = `public class Service {
    private Repository repository;
    private Util util;
}`;
      const result = parseJavaSource(source);

      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toEqual({ name: 'repository', typeName: 'Repository' });
      expect(result.fields[1]).toEqual({ name: 'util', typeName: 'Util' });
    });

    it('should skip primitive and String fields', () => {
      const source = `public class Foo {
    private int count;
    private String name;
    private Repository repo;
}`;
      const result = parseJavaSource(source);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].typeName).toBe('Repository');
    });

    it('should extract final fields', () => {
      const source = `public class Service {
    private final Repository repo;
}`;
      const result = parseJavaSource(source);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]).toEqual({ name: 'repo', typeName: 'Repository' });
    });

    it('should deduplicate fields with the same name (first occurrence wins)', () => {
      // Real dedup scenario: class-level field declaration + method-body local variable
      // with the same name and type — both lines match FIELD_RE.
      // The `seen` Set in extractFields ensures only the class field (first occurrence) is kept.
      const source = `public class Service {
    private Repository repo;
    public void run() {
        Repository repo = new Repository();
        repo.save();
    }
}`;
      const result = parseJavaSource(source);

      // Class field + local variable both match FIELD_RE → seen Set deduplicates to 1
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]).toEqual({ name: 'repo', typeName: 'Repository' });
    });

    it('should extract package-private field (no access modifier)', () => {
      // FIELD_RE access-modifier group is optional — package-private fields captured
      const source = `public class Service {
    Repository repo;
}`;
      const result = parseJavaSource(source);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]).toEqual({ name: 'repo', typeName: 'Repository' });
    });

    it('should not capture generic-type fields (known limitation)', () => {
      // FIELD_RE: (\w+)\s+(\w+) fails for `List<String> items` because `<` follows
      // `List` with no space — FIELD_RE requires \s+ between type and name tokens.
      // Generic injection (`List<Repository> repos`) is silently dropped.
      const source = `public class Service {
    private List<String> items;
    private Repository repo;
}`;
      const result = parseJavaSource(source);

      // Only the non-generic field is captured
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe('repo');
    });

    it('should not capture volatile field (volatile modifier not handled by FIELD_RE)', () => {
      // Known limitation: FIELD_RE has no (?:volatile\s+)? — volatile fields dropped
      const source = `public class Service {
    private volatile Repository repo;
    private Repository nonVolatileRepo;
}`;
      const result = parseJavaSource(source);

      // volatile repo NOT captured; only the non-volatile one is
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].name).toBe('nonVolatileRepo');
    });
  });

  describe('Scenario: No ghost methods from statement keywords as return type', () => {
    it('should not create a ghost method from else method() on its own line', () => {
      // "else delete();" → METHOD_RE matches: returnType='else', name='delete' → ghost without fix
      const source = `public class Service {
    public void process(boolean flag) {
        if (flag) validate();
        else delete();
    }
    public void validate() {}
    public void delete() {}
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(3);
      expect(result.methods.map((m) => m.name)).toEqual(['process', 'validate', 'delete']);
    });

    it('should not create a ghost method when a method body contains return unqualifiedCall()', () => {
      const source = `public class Service {
    public String processOrder(String id) {
        return format(id);
    }
    public String format(String id) {
        return id.toUpperCase();
    }
}`;
      const result = parseJavaSource(source);

      // Only 2 real methods — no ghost 'format' created from the return statement
      expect(result.methods).toHaveLength(2);
      expect(result.methods.map((m) => m.name)).toEqual(['processOrder', 'format']);
    });

    it('should not create a ghost method from return new ClassName() on a single line', () => {
      // `return new ArrayList()` on one line: METHOD_RE sees `return` as returnType
      // which IS in NON_RETURN_TYPE_KEYWORDS — correctly filtered.
      const source = `public class Foo {
    public Object build() {
        return new ArrayList();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('build');
    });

    it('should extract method with generic return type', () => {
      const source = `public class Foo {
    public List<String> build() {
        return new ArrayList<>();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('build');
    });

    it('should not create a ghost method from new ClassName( on its own line', () => {
      // Multiline instantiation: `new Service(` on its own line must not be treated
      // as a method declaration. 'new' is in NON_RETURN_TYPE_KEYWORDS.
      const source = `public class Foo {
    public void run() {
        service =
            new Service(repo);
        doWork();
    }
    public void doWork() {}
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(2);
      expect(result.methods.map((m) => m.name)).toEqual(['run', 'doWork']);
    });

    it('should not create a ghost method from throw method() pattern', () => {
      const source = `public class Service {
    public void run() {
        throw buildError();
    }
    public RuntimeException buildError() {
        return new RuntimeException("err");
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(2);
      expect(result.methods.map((m) => m.name)).toEqual(['run', 'buildError']);
    });
  });

  describe('Scenario: Constructor parameter type resolution limitation', () => {
    it('should return 0 fields when type only appears as a constructor parameter or method parameter (no field declaration)', () => {
      // Known limitation of the regex approach (ADR-005 Option B):
      // FIELD_RE matches field declarations ending in ; or = but not constructor or method
      // parameter lists. Neither constructor parameters nor method parameters are captured.
      // The feature scenario for "Constructor parameter type resolution" requires an explicit
      // `private final Repository repo;` field — that is what FIELD_RE captures.
      const source = `public class Service {
    public Service(Repository repo) {
        // constructor param — not a field declaration
    }
    public void run(Repository repo) {
        // method param — also not a field declaration
        repo.save();
    }
}`;
      const result = parseJavaSource(source);

      // Neither constructor params nor method params are captured → 0 fields
      // → repo.save() calls in this class cannot be resolved via field lookup
      expect(result.fields).toHaveLength(0);
    });

    it('should extract field when both field declaration and constructor exist', () => {
      // This is the supported pattern: explicit field + constructor assignment
      const source = `public class Service {
    private final Repository repo;
    public Service(Repository repo) {
        this.repo = repo;
    }
    public void run() {
        repo.save();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]).toEqual({ name: 'repo', typeName: 'Repository' });
    });
  });

  describe('Scenario: Class name extraction edge cases', () => {
    it('should extract class name from abstract class declaration', () => {
      const source = `public abstract class BaseService {
    public abstract void run();
}`;
      const result = parseJavaSource(source);

      expect(result.className).toBe('BaseService');
    });

    it('should return outer class name when source contains inner class', () => {
      const source = `public class Outer {
    private class Inner {
        void helper() {}
    }
}`;
      const result = parseJavaSource(source);

      expect(result.className).toBe('Outer');
    });

    it('should return empty string for interface-only source (no class keyword)', () => {
      const source = `public interface Runnable {
    void run();
}`;
      const result = parseJavaSource(source);

      expect(result.className).toBe('');
    });

    it('should return class name from actual class declaration, not from comment', () => {
      const source = `// This is the class UserService adapter
public class OrderService {
}`;
      const result = parseJavaSource(source);

      expect(result.className).toBe('OrderService');
    });
  });

  describe('Scenario: Method body line extraction', () => {
    it('should populate bodyLines with source lines between opening and closing brace', () => {
      const source = `public class Foo {
    public void run() {
        doWork();
        log("done");
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods[0].bodyLines).toEqual([
        '        doWork();',
        '        log("done");',
      ]);
    });

    it('should not extract abstract methods (no body — known limitation)', () => {
      // Abstract methods have no `{...}` body. METHOD_RE matches the signature
      // but the regex fails because `public abstract void run()` has 3 modifiers
      // before the return type, causing the 2-capture pattern to fail.
      const source = `public abstract class BaseService {
    public abstract void run();
    public void concrete() {}
}`;
      const result = parseJavaSource(source);

      // Only concrete() is extracted — abstract run() silently dropped
      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('concrete');
    });

    it('should extract method when @Override annotation appears on preceding line', () => {
      const source = `public class Service {
    @Override
    public void run() {
        doWork();
    }
}`;
      const result = parseJavaSource(source);

      expect(result.methods).toHaveLength(1);
      expect(result.methods[0].name).toBe('run');
    });
  });

  describe('Scenario: Graceful degradation on empty/malformed source', () => {
    it('should return empty results for empty source', () => {
      const result = parseJavaSource('');

      expect(result.className).toBe('');
      expect(result.methods).toHaveLength(0);
      expect(result.fields).toHaveLength(0);
    });

    it('should return empty results for whitespace-only source', () => {
      const result = parseJavaSource('   \n\t\n   ');

      expect(result.className).toBe('');
      expect(result.methods).toHaveLength(0);
      expect(result.fields).toHaveLength(0);
    });

    it('should return partial results for malformed source', () => {
      const source = `public class Broken {
    this is not valid java {{{{
    public void broken( {`;
      const result = parseJavaSource(source);

      expect(result.className).toBe('Broken');
      // Should not throw — just return whatever it can parse
    });
  });
});
