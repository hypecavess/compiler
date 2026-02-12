# Language Reference

Welcome to the **Fradual** language reference. This document provides a comprehensive overview of the language syntax, data types, and all features supported by the current version of the compiler.

## 1. Syntax Basics

Fradual uses a clean, C-style syntax. Statements end with semicolons `;`, and blocks are enclosed in curly braces `{}`.

### Comments
```javascript
// This is a single-line comment.
var a = 10; // Comments can also appear at the end of a line.
```

> **Note:** Block comments (`/* ... */`) are not supported.

---

## 2. Variables & Data Types

Variables are dynamically typed and declared using the `var` keyword.

### Declaration
```javascript
var name = "Nothinger";
var age = 25;
var isActive = true;
var empty;         // Initialized to nil
```

### Data Types

| Type | Description | Examples |
|---|---|---|
| **Number** | Double-precision floating-point | `123`, `3.14`, `-5`, `0.001` |
| **String** | Text enclosed in double quotes | `"Hello World"`, `""` |
| **Boolean** | Logical values | `true`, `false` |
| **Nil** | Absence of a value | `nil` |
| **Array** | Ordered collection of values | `[1, 2, 3]`, `["a", true, nil]` |

### Truthiness

In boolean contexts (conditions, `!`, `and`, `or`), the following values are **falsey**: `false`, `nil`, `0`, `""`. Everything else is **truthy**.

> ⚠️ **Gotcha:** `0` and `""` are falsey in Fradual (JavaScript-style truthiness).

---

## 3. Operators

### Arithmetic
```javascript
print 10 + 5;   // 15 (addition)
print 10 - 5;   // 5  (subtraction)
print 10 * 5;   // 50 (multiplication)
print 10 / 5;   // 2  (division)
print -10;      // -10 (unary negation)
```

The `+` operator also concatenates strings:
```javascript
print "Hello " + "World"; // "Hello World"
```

> ⚠️ **Type error:** Mixing types with `+` (e.g., `"age: " + 25`) causes a runtime error. Both operands must be the same type (both numbers or both strings).

### Comparison
```javascript
print 10 > 5;   // true
print 10 < 5;   // false
print 10 >= 5;  // true
print 10 <= 5;  // false
```

> Comparison operators only work on numbers. Using them on other types causes a runtime error.

### Equality
```javascript
print 10 == 10; // true
print 10 != 5;  // true
print "a" == "a"; // true
print nil == nil;  // true
print 1 == true;   // false (strict equality, no type coercion)
```

### Logical
```javascript
print true and false; // false
print true or false;  // true
print !true;          // false
```

**Short-circuit evaluation:**
```javascript
var a = false;
print a and (a = true); // false — right side never evaluated
print a;                // false — a was never changed

var b = true;
print b or (b = false); // true — right side never evaluated
print b;                // true — b was never changed
```

---

## 4. Control Flow

### If / Else
```javascript
var score = 85;

if (score >= 90) {
    print "Grade: A";
} else if (score >= 80) {
    print "Grade: B";
} else {
    print "Grade: C";
}
```

> `else if` is not a special syntax — it's an `else` followed by another `if`, which works naturally because `if` is a statement.

### While Loops
```javascript
var count = 3;
while (count > 0) {
    print count;
    count = count - 1;
}
print "Done!";
```

### For Loops
```javascript
for (var i = 0; i < 5; i = i + 1) {
    print i;
}
```

The for loop has three parts: `for (initializer; condition; increment)`.
- **Initializer:** Run once before the loop (`var` declaration or expression). Can be omitted: `for (; ...)`
- **Condition:** Checked before each iteration. If omitted, it's `true` (infinite loop).
- **Increment:** Run after each iteration body.

> Internally, `for` loops are desugared into `while` loops by the parser.

---

## 5. Functions

Functions are first-class citizens, declared with the `fun` keyword.

### Definition & Invocation
```javascript
fun greet(name) {
    return "Hello, " + name + "!";
}
print greet("User"); // Hello, User!
```

### Return Values
Functions return `nil` by default unless a `return` statement is used.
```javascript
fun add(a, b) {
    return a + b;
}
var sum = add(10, 20); // 30
```

### Recursion
```javascript
fun fib(n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}
print fib(10); // 55
```

### Closures

Functions capture variables from their enclosing scope. These captured variables (upvalues) remain alive even after the enclosing scope has ended.

```javascript
fun makeCounter() {
    var count = 0;
    fun increment() {
        count = count + 1;
        return count;
    }
    return increment;
}

var counter = makeCounter();
print counter(); // 1
print counter(); // 2
print counter(); // 3
```

> ⚠️ **Limits:** Maximum 255 parameters per function. Maximum 256 local variables per function scope.

---

## 6. Scope

Fradual uses **lexical scoping**. Variables declared in an outer block are accessible in inner blocks, but not vice versa.

```javascript
var global = "global";

{
    var local = "local";
    print global; // Accessible
    print local;  // Accessible
}
// print local; // Runtime error: Undefined variable 'local'
```

Functions defined inside other scopes can access variables from their enclosing scope (see Closures above).

---

## 7. Arrays

Arrays are ordered, dynamically-sized collections that can hold values of mixed types.

### Creating Arrays
```javascript
var numbers = [1, 2, 3, 4, 5];
var mixed = ["hello", 42, true, nil];
var empty = [];
```

### Accessing Elements
Array elements are accessed by zero-based index using bracket notation:
```javascript
var fruits = ["apple", "banana", "cherry"];
print fruits[0]; // apple
print fruits[2]; // cherry
```

### Modifying Elements
```javascript
var arr = [10, 20, 30];
arr[1] = 99;
print arr[1]; // 99
```

> ⚠️ **Runtime error:** Accessing an index outside `0..length-1` causes a runtime error (no auto-grow).

### Array Functions
```javascript
var arr = [1, 2, 3];

print len(arr);   // 3
push(arr, 4);     // arr is now [1, 2, 3, 4]
var last = pop(arr); // last = 4, arr is now [1, 2, 3]
```

---

## 8. Classes

Fradual supports basic object-oriented programming with classes.

### Class Declaration
```javascript
class Dog {
}
```

### Instantiation
Create an instance by calling the class like a function:
```javascript
var dog = Dog();
```

### Fields
Instances can have dynamic fields that are accessed and assigned using dot notation:
```javascript
var dog = Dog();
dog.name = "Buddy";
dog.age = 3;

print dog.name; // Buddy
print dog.age;  // 3
```

> ⚠️ **Current limitations:**
> - No constructors — fields must be assigned after creation
> - No methods — only field get/set is supported
> - No inheritance or `super`
> - `this` keyword compiles but is non-functional (always evaluates to `nil`)

---

## 9. Native Functions

Built-in functions available globally without any imports:

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `clock()` | none | `number` | Seconds since Unix epoch (float) |
| `len(x)` | array or string | `number` | Length of array or string; `0` for other types |
| `push(arr, val)` | array, any value | the pushed value | Appends `val` to end of `arr` |
| `pop(arr)` | array | the removed value | Removes and returns last element; `nil` if empty |

```javascript
// Benchmarking
var start = clock();
// ... heavy computation ...
print clock() - start;

// String length
print len("hello"); // 5

// Array manipulation
var items = [];
push(items, "first");
push(items, "second");
print len(items);  // 2
print pop(items);  // second
```

---

## 10. Print Statement

`print` is a built-in statement (not a function) that outputs a value followed by a newline:

```javascript
print 42;          // 42
print "hello";     // hello
print true;        // true
print nil;         // null
print [1, 2, 3];   // 1,2,3
```

> `print` is a statement, not a function — no parentheses needed: `print x;` not `print(x)`.

---

## 11. Error Handling

Fradual has no `try`/`catch` mechanism. Errors halt execution:

- **Syntax errors** — detected during parsing (e.g., missing semicolons, unmatched braces)
- **Compile errors** — detected during compilation (e.g., too many locals, returning from top-level)
- **Runtime errors** — detected during execution (e.g., type mismatches, undefined variables, array out of bounds, stack overflow, execution timeout)

---

## Quick Reference

```javascript
// Variables
var x = 42;
var name = "Fradual";

// Control flow
if (x > 0) { print "positive"; } else { print "non-positive"; }
while (x > 0) { x = x - 1; }
for (var i = 0; i < 10; i = i + 1) { print i; }

// Functions & closures
fun add(a, b) { return a + b; }
fun makeAdder(n) { fun adder(x) { return x + n; } return adder; }

// Arrays
var arr = [1, 2, 3];
push(arr, 4);
print arr[0];
print len(arr);

// Classes
class Point {}
var p = Point();
p.x = 10;
p.y = 20;

// Natives
print clock();
```
