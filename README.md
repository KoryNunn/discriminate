# discriminate

A data validator with an idiomatic API

# Example:

## Creating Discriminators:
```
var discriminate = require('discriminate');
var { Required, Custom, Maybe, And, Or } = discriminate;

const Email = discriminate(discriminate.And(
    String,
    Custom(([path, name], value, callback) =>
        value.match(/^.+@[^.].*?\..*[^.]$/) ? callbacl(null, value) : callback(`${path[1]} must be an email`)
    )
));

const User = discriminate({
    firstName: String,
    surname: String,
    email: Maybe(Email),
    nickname: Maybe(String, 'Buddy'),
    age: Number
});

function greetUser(maybeNotAValidUser){
    User(maybeNotAValidUser, function(error, user){
        if(error){
            /*
                error will look like:
                {
                    message: ...
                    errors: [
                        { path: 'path.in.schema', message: ... }
                    ]
                }
            */
            return;
        }

        // user will be valid at this point.
    });
}

```

# Available base types:

value type constructors are valid, eg:

`String`, `Number`, `Boolean`

Extra types provided by discriminate:

## `Maybe(Type, default<optional>)`

Ensure a value is either Type or null/undefined

## `And(Types...)`

Ensures a value is every one of `Types`.

## `Or(Types...)`

Ensures a value is any one of `Types`.

## `Custom(fn<value>)`

Ensures `fn(value)` does not throw.

The value returned from `fn` will be the result of the type instansiation.

## `Required(Type)`

Prints a nicer error if a value is null or undefined, eg: 'age is required.'