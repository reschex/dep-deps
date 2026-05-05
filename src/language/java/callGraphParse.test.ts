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
  });

  describe('Scenario: No ghost methods from statement keywords as return type', () => {
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
    it('should return 0 fields when type only appears as a constructor parameter (no field declaration)', () => {
      // Known limitation of the regex approach (ADR-005 Option B):
      // FIELD_RE matches field declarations ending in ; or = but not constructor parameter lists.
      // A class with constructor-only injection and no explicit field cannot be resolved.
      // The feature scenario for "Constructor parameter type resolution" requires an explicit
      // `private final Repository repo;` field — that field is what FIELD_RE captures.
      const source = `public class Service {
    public Service(Repository repo) {
        // repo used locally but never assigned to a field
    }
    public void run(Repository repo) {
        repo.save();
    }
}`;
      const result = parseJavaSource(source);

      // No field declaration → 0 fields → repo.save() calls cannot be resolved
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

  describe('Scenario: Graceful degradation on empty/malformed source', () => {
    it('should return empty results for empty source', () => {
      const result = parseJavaSource('');

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
