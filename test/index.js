var discriminate = require('../');
var { Required, Custom, Maybe, And, Or, Any, List, Cast } = discriminate;
var test = require('tape');

test('native types', function(t){
    t.plan(1);

    var validator = discriminate('User', {
        name: String,
        age: Number
    });

    validator({
        name: 123,
        age: null
    }, function(error){
        t.deepEqual(error, { message: 'Invalid User', errors: [
            { path: 'User.name', message: 'name must be a String, but saw `123`' },
            { path: 'User.age', message: 'age must be a Number, but saw `null`' }
        ] }, 'Got expected errors');
    });
});

test('Required gives nicer errors', function(t){
    t.plan(1);

    var validator = discriminate('User', {
        name: Required(String),
        age: Required(Number)
    });

    validator.validate({
        name: 123,
        age: null
    }, function(error){
        t.deepEqual(error, { message: 'Invalid User', errors: [
            { path: 'User.name', message: 'name must be a String, but saw `123`' },
            { path: 'User.age', message: 'age is required.' }
        ] }, '');
    });
});

test('null', function(t){
    t.plan(2);

    var validator = discriminate('data', {
        value: null
    });

    validator.validate({
        value: null,
    }, function(error, result){
        t.deepEqual(result, { value: null });
    });

    validator.validate({
        value: 'abc',
    }, function(error){
        t.deepEqual(error, { message: 'Invalid data', errors: [
            { path: 'data.value', message: 'value must be null, but saw `"abc"`' },
        ] }, '');
    });
});


test('Custom type', function(t){
    t.plan(1);

    var NonEmptyString = Custom((path, value, callback) => {
        if(!value){
            return callback({
                path: path[0],
                message: `${path[1]} must be a non-empty-string`
            });
        }

        callback(null, value);
    });

    var validator = discriminate('User', {
        name: NonEmptyString
    });

    validator.validate({
        name: '',
    }, function(error){
        t.deepEqual(error, { message: 'Invalid User', errors: [
            { path: 'User.name', message: 'name must be a non-empty-string' },
        ] }, '');
    });
});

test('And', function(t){
    t.plan(2);

    var NonEmptyString = Custom((path, value, callback) => {
        if(!value){
            return callback({
                path: path[0],
                message: `${path[1]} must be a non-empty-string`
            });
        }

        callback(null, value);
    });

    var validator = discriminate('User', {
        name: And(String, NonEmptyString)
    });

    validator.validate({
        name: 123,
    }, function(error){
        t.deepEqual(error, { message: 'Invalid User', errors: [
            { path: 'User.name', message: 'name must be a String, but saw `123`' },
        ] }, '');
    });

    validator.validate({
        name: '',
    }, function(error){
        t.deepEqual(error, { message: 'Invalid User', errors: [
            { path: 'User.name', message: 'name must be a non-empty-string' },
        ] }, '');
    });
});

test('Or', function(t){
    t.plan(3);

    var validator = discriminate('data', {
        value: Or(String, Number)
    });

    validator.validate({
        value: 'abc',
    }, function(error, result){
        t.deepEqual(result, { value: 'abc' });
    });

    validator.validate({
        value: 123,
    }, function(error, result){
        t.deepEqual(result, { value: 123 });
    });

    validator.validate({
        value: null,
    }, function(error){
        t.deepEqual(error, { message: 'Invalid data', errors: [
            { path: 'data.value', message: 'value must be a String or Number, but saw `null`' },
        ] }, '');
    });
});

test('nested Or', function(t){
    t.plan(3);

    var validator = discriminate('data', Or(
        {
            name: String
        },
        {
            firstName: String,
            surname: String
        }
    ));

    validator.validate({
        name: 'bob smith',
    }, function(error, result){
        t.deepEqual(result, { name: 'bob smith' });
    });

    validator.validate({
        firstName: 'bob',
        surname: 'smith',
    }, function(error, result){
        t.deepEqual(result, {
            firstName: 'bob',
            surname: 'smith',
        });
    });

    validator.validate({
        firstName: 'bob',
    }, function(error){
        t.deepEqual(error, { message: 'Invalid data', errors: [
            { path: 'data', message: 'data must be a {"name":"String"} or {"firstName":"String","surname":"String"}, but saw `{"firstName":"bob"}`' },
        ] }, '');
    });
});

test('Maybe', function(t){
    t.plan(3);

    var validator = discriminate('data', {
        value: Maybe(String)
    });

    validator.validate({
        value: 'abc',
    }, function(error, result){
        t.deepEqual(result, { value: 'abc' });
    });

    validator.validate({
        value: null,
    }, function(error, result){
        t.deepEqual(result, { value: null });
    });

    validator.validate({
        value: 123,
    }, function(error){
        t.deepEqual(error, { message: 'Invalid data', errors: [
            { path: 'data.value', message: 'value must be a String or null, but saw `123`' },
        ] }, '');
    });
});

test('Any', function(t){
    t.plan(3);

    var validator = discriminate('data', {
        value: Any()
    });

    validator.validate({
        value: 'abc',
    }, function(error, result){
        t.deepEqual(result, { value: 'abc' });
    });

    validator.validate({
        value: null,
    }, function(error, result){
        t.deepEqual(result, { value: null });
    });

    validator.validate({
        value: 123,
    }, function(error, result){
        t.deepEqual(result, { value: 123 });
    });
});

test('List', function(t){
    t.plan(2);

    var validator = discriminate(List(Number));

    validator.validate([
        1
    ], function(error, result){
        t.deepEqual(result, [ 1 ]);
    });

    validator.validate([
        '1'
    ], function(error, result){
        t.deepEqual(error, {
          message: 'Invalid data',
          errors: [ { path: '0', message: '0 must be a Number, but saw `"1"`' } ]
        });
    });
});

test('List - min length', function(t){
    t.plan(2);

    var validator = discriminate(List(Number, 3));

    validator.validate([
        1, 2, 3
    ], function(error, result){
        t.deepEqual(result, [ 1 ,2, 3 ], 'Valid list of Type passes');
    });

    validator.validate([
        1, 2
    ], function(error, result){
        t.deepEqual(error, {
          message: 'Invalid data',
          errors: [ { path: null, message: 'value must be of minimum length 3, but length was 2' } ]
        });
    });
});

test('List - max length', function(t){
    t.plan(2);

    var validator = discriminate(List(Number, 0, 3));

    validator.validate([
        1, 2, 3
    ], function(error, result){
        t.deepEqual(result, [ 1 ,2, 3 ], 'Valid list of Type passes');
    });

    validator.validate([
        1, 2, 3, 4
    ], function(error, result){
        t.deepEqual(error, {
          message: 'Invalid data',
          errors: [ { path: null, message: 'value must be of maximum length 3, but length was 4' } ]
        });
    });
});

test('List - min and max length', function(t){
    t.plan(3);

    var validator = discriminate(List(Number, 3, 3));

    validator.validate([
        1, 2, 3
    ], function(error, result){
        t.deepEqual(result, [ 1 ,2, 3 ], 'Valid list of Type passes');
    });

    validator.validate([
        1, 2
    ], function(error, result){
        t.deepEqual(error, {
          message: 'Invalid data',
          errors: [ { path: null, message: 'value must be of minimum length 3, but length was 2' } ]
        });
    });

    validator.validate([
        1, 2, 3, 4
    ], function(error, result){
        t.deepEqual(error, {
          message: 'Invalid data',
          errors: [ { path: null, message: 'value must be of maximum length 3, but length was 4' } ]
        });
    });
});

test('List of objects', function(t){
    t.plan(1);

    var validator = discriminate(List({
        foo: String
    }));

    validator.validate([
        { foo: 'bar' },
        { foo: 'baz' }
    ], function(error, result){
        t.deepEqual(result, [
            { foo: 'bar' },
            { foo: 'baz' }
        ]);
    });
});

test('List of objects with errors', function(t){
    t.plan(1);

    var validator = discriminate(List({
        foo: String
    }));

    validator.validate([
        { foo: 'bar' },
        { foo: 1 }
    ], function(error){
        t.deepEqual(error, {
          message: 'Invalid data',
          errors: [ { path: '1.foo', message: 'foo must be a String, but saw `1`' } ]
        });
    });
});

test('Cast', function(t){
    t.plan(3);

    var validator = discriminate(Cast(Number));

    validator.validate(1, function(error, result){
        t.deepEqual(result, 1);
    });

    validator.validate('1', function(error, result){
        t.deepEqual(result, 1);
    })

    validator.validate(false, function(error, result){
        t.deepEqual(error, {
          message: 'Invalid data',
          errors: [ { path: null, message: 'value must be castable to Number, but saw `false`' } ]
        });
    });
});

test('Sub Spec', function(t){
    t.plan(2);

    var subSpec = discriminate({
        something: String
    });

    var spec = discriminate({
        sub: subSpec
    });

    var thing = spec({
        sub: {
            something: 'foo'
        }
    }, function(error, result){
        t.deepEqual(result, {
            sub: {
                something: 'foo'
            }
        })
    });

    var thing = spec({
        sub: {
            something: false
        }
    }, function(error){
        t.deepEqual(
            error,
            {
                message: 'Invalid data',
                errors: [
                    {
                        path: 'sub.something',
                        message: 'something must be a String, but saw `false`'
                    }
                ]
            }
        )
    });

});