# Language Reference

Welcome to the **Fradual** language reference. This document provides a comprehensive overview of the language syntax, data types, and core features supported by the Compiler.

## 1. Syntax Basics

Fradual uses a clean, C-style syntax designed for readability and ease of use. Statements often end with semicolons `;`, and blocks are enclosed in curly braces `{}`.

### Comments
Comments are used to explain code and are ignored by the compiler.
```javascript
// This is a single-line comment.
var a = 10; // Comments can also appear at the end of a line.
```

## 2. Variables & Data Types

Variables are dynamically typed and declared using the `var` keyword.

### Declaration
```javascript
var name = "Nothinger";
var age = 25;
var isActive = true;
```

### Data Types
Fradual supports the following primitive types:

| Type      | Description                                      | Example             |
| :-------- | :----------------------------------------------- | :------------------ |
| **Number**| Double-precision floating-point numbers.         | `123`, `3.14`, `-5` |
| **String**| Text enclosed in double quotes.                  | `"Hello World"`     |
| **Boolean**| Logical values.                                  | `true`, `false`     |
| **Nil**   | Represents the absence of a value.               | `nil`               |

## 3. Operators

### Arithmetic
Standard arithmetic operations are supported for numbers.
```javascript
print 10 + 5; // Addition (15)
print 10 - 5; // Subtraction (5)
print 10 * 5; // Multiplication (50)
print 10 / 5; // Division (2)
```
*Note: The `+` operator can also concatenate strings.*
```javascript
print "Hello " + "World"; // "Hello World"
```

### Comparison
Operators for comparing values.
```javascript
print 10 > 5;  // Greater than (true)
print 10 < 5;  // Less than (false)
print 10 >= 5; // Greater than or equal (true)
print 10 <= 5; // Less than or equal (false)
```

### Equality
Check if two values are equal or not.
```javascript
print 10 == 10; // Equal (true)
print 10 != 5;  // Not equal (true)
```

### Logical
Combine boolean expressions.
```javascript
print true and false; // Logical AND (false)
print true or false;  // Logical OR (true)
print !true;          // Logical NOT (false)
```

## 4. Control Flow

### If / Else
Execute code conditionally.
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

### While Loops
Repeat a block of code as long as a condition is true.
```javascript
var count = 3;
while (count > 0) {
    print count;
    count = count - 1;
}
print "Liftoff!";
```

## 5. Functions

Functions are first-class citizens in Fradual. They are declared using the `fun` keyword.

### Definition
```javascript
fun greet(name) {
    return "Hello, " + name + "!";
}
```

### Invocation
```javascript
print greet("User"); // Output: Hello, User!
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
Functions can call themselves recursively.
```javascript
fun fib(n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}
print fib(10); // 55
```

## 6. Scope

Fradual uses **lexical scoping**. Variables declared in an outer block are accessible in inner blocks, but not vice-versa.

```javascript
var global = "global";

{
    var local = "local";
    print global; // Accessible
    print local;  // Accessible
}
// print local; // Error: Undefined variable 'local'
```

## 7. Native Functions

The language includes a small standard library of native functions implemented directly in the VM.

*   `clock()`: Returns the number of seconds since the program started. Useful for benchmarking.

## 8. Classes

Fradual supports basic object-oriented programming with classes.

### Class Declaration
Classes are declared using the `class` keyword.
```javascript
class Person {
}
```

### Instantiation
Create an instance by calling the class like a function.
```javascript
var p = Person();
```

### Fields
Instances can have dynamic fields that are accessed and assigned using dot notation.
```javascript
var dog = Dog();
dog.name = "Buddy";
dog.age = 3;

print dog.name; // "Buddy"
print dog.age;  // 3
```

> **Note:** Class methods are not yet supported. Only field access is available in the current version.

