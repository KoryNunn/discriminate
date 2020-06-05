var righto = require('righto');
var flatten = require('@flatten/array');
var asyncOr = require('async-or');

function Type(){}
function Default(value){
    this.value = value;
}

var constructors = {
    'String': ''.constructor,
    'Number': (0).constructor,
    'Boolean': true.constructor
}

function getName(spec){
    var type = typeof spec;
    return type === 'function' ? spec.name :
        type === 'object' ? JSON.stringify(Object.keys(spec).reduce((result, key) => {
            result[key] = getName(spec[key]);
            return result;
        }, {})) :
        type;
}

function isBaseType(spec){
    return (
        spec === null ||
        spec.name in constructors &&
        constructors[spec.name] === spec
    );
}

function throwError(message, errors){
    var error = new Error(`\nBlazon error:\n\t${message}\n\nSpec:\n\t${errors}\nSource:`)

    error.stack = error.stack.replace(/^.*\/discriminate\/.*$\n/gm, '');

    throw error;
}

function buildPath(path, key){
    return (path ? path + '.' : '') + key;
}

function checkBaseType(spec, value, path, callback){
    if(
        spec === null && value === spec ||
        spec &&
        value != null &&
        value.constructor.name === spec.name &&
        value.constructor.name in constructors &&
        value.constructor === constructors[value.constructor.name]
    ){
        return callback(null, value);
    }

    callback({
        path: path[0],
        message: `${path[1]} must be ${spec === null ? 'null' : 'a ' + getName(spec)}, but saw \`${JSON.stringify(value)}\``
    });
}

function getAnyErrors(hasErrors, allResults, callback){
    if(!hasErrors){
        return callback(null, allResults
            .map(result => result[1])
            .filter(error => error)
        );
    }
    callback(allResults
        .map(result => result[0])
        .filter(error => error)
    );
}

function checkAllResults(validationChecks, callback){
    var allResults = righto.all(validationChecks.map(validation => righto.surely(validation)));
    var hasErrors = righto.handle(righto.all(validationChecks).get(() => false), (error, done) => done(null, !!error));

    var result = righto(getAnyErrors, hasErrors, allResults);

    result(callback);
}

function checkObject(spec, target, data, path, callback){
    if(data == null || !(data instanceof Object)){
        return callback({
            path: path[0],
            message: `${path[1]} should be an Object, but saw \`${JSON.stringify(data)}\``
        });
    }

    var validationChecks = Object.keys(spec).map(key =>
        righto(check, spec[key], target[key] || {}, data[key], [buildPath(path[0], key), key])
        .get(result => {
            if(result || key in data){
                target[key] = result && result instanceof Default ? result.value : result;
            }
        })
    );

    // console.log(target);
    var result = righto(checkAllResults, validationChecks)
        .get(() => {
            return target
        });

    result(callback);
}

function SubSpec(){}

function check(spec, target, value, path, callback){
    if(spec && spec.prototype instanceof SubSpec){
        return spec(path, value, function(error, result){
            if(error){
                return callback(error.errors);
            }

            callback(null, result);
        });
    }
    if(spec && spec instanceof Type){
        return spec.validate(target, value, path, callback);
    }

    if(isBaseType(spec)){
        return checkBaseType(spec, value, path, callback);
    } else if(spec instanceof Function){
        if(value && value instanceof spec){
            return callback(null, value);
        }
    } else if(spec instanceof Object){
        return checkObject(spec, target, value, path, callback);
    }

    callback({
        path: path[0],
        message: `Invalid type: Expected ${getName(spec)}, Got: ${value}`
    });
}

function Required(spec){
    if(!(this instanceof Required)){
        return new Required(spec);
    }
    this.spec = spec;
    return this;
}
Required.prototype = Object.create(Type.prototype);
Required.prototype.constructor = Required;
Required.prototype.validate = function(target, value, path, callback){
    if(value == null){
        return callback({
            path: path[0],
            message: `${path[1]} is required.`
        })
    }

    return check(this.spec, target, value, path, callback);
}

function Maybe(spec, defaultValue){
    var hasDefault = arguments.length > 1;

    if(!(this instanceof Maybe)){
        if(hasDefault){
            return new Maybe(spec, defaultValue);
        }
        return new Maybe(spec);
    }

    this.spec = spec;
    if(hasDefault){
        this.defaultValue = new Default(defaultValue);
    }
    return this;
}
Maybe.prototype = Object.create(Type.prototype);
Maybe.prototype.constructor = Maybe;
Maybe.prototype.validate = function(target, value, path, callback){
    if(value == null){
        if('defaultValue' in this){
            return callback(null, this.defaultValue);
        }

        return callback(null, value);
    }

    var result = righto.handle(
        righto(check, this.spec, target, value, path),
        (error, done) => {
            done({
                path: path[0],
                message: `${path[1]} must be a ${getName(this.spec)} or null, but saw \`${JSON.stringify(value)}\``
            })
        }
    );

    result(callback);
}

function Custom(validater){
    if(!(this instanceof Custom)){
        return new Custom(validater);
    }

    this.validater = validater;
}
Custom.prototype = Object.create(Type.prototype);
Custom.prototype.constructor = Custom;
Custom.prototype.validate = function(target, value, path, callback){
    this.validater(path, value, callback);
}

function And(){
    if(!(this instanceof And)){
        return And.apply(Object.create(And.prototype), arguments);
    }

    this.types = [].slice.call(arguments);
    return this;
}
And.prototype = Object.create(Type.prototype);
And.prototype.constructor = And;
And.prototype.validate = function(target, value, path, callback){
    var itemValidations = this.types.map(type => righto(check, type, target, value, path));
    var result = righto(checkAllResults, itemValidations)
        .get((results) => results[results.length - 1]);

    result(callback);
}

function Or(){
    if(!(this instanceof Or)){
        return Or.apply(Object.create(Or.prototype), arguments);
    }

    this.types = [].slice.call(arguments);
    return this;
}
Or.prototype = Object.create(Type.prototype);
Or.prototype.constructor = Or;
Or.prototype.validate = function(target, value, path, callback){
    var itemValidations = this.types.map(type => righto(check, type, target, value, path));
    var result = righto.handle(
        righto(asyncOr, itemValidations),
        (error, done) => {
            var newError = righto.all(itemValidations.map(validation =>
                righto.surely(righto(validation)).get(0)
            )).get(errors => {
                return righto.fail({
                    path: path[0],
                    message: `${path[1]} must be a ${this.types.map(type => getName(type)).join(' or ')}, but saw \`${JSON.stringify(value)}\``
                });
            });

            newError(done);
        }
    );

    result(callback);
}

function Any(){
    if(!(this instanceof Any)){
        return Any.apply(Object.create(Any.prototype), arguments);
    }

    return this;
}
Any.prototype = Object.create(Type.prototype);
Any.prototype.constructor = Any;
Any.prototype.validate = function(target, value, path, callback){
    callback(null, value);
}

function List(type, minLength, maxLength){
    if(!(this instanceof List)){
        return List.apply(Object.create(List.prototype), arguments);
    }

    this.type = type;
    this.minLength = minLength || 0;
    this.maxLength = maxLength || Infinity;
    return this;
}
List.prototype = Object.create(Type.prototype);
List.prototype.constructor = List;
List.prototype.print = function(){
    return `${this.constructor.name}(${printType(this.type)}), minimum length: ${this.minLength}, maximum length: ${this.maxLength}`;
}
List.prototype.validate = function(target, value, path, callback){
    var type = this.type;
    if(!Array.isArray(value)){
        return callback({
            path: path[0],
            message: `${path[1] || 'value'} must be an array, but saw \`${JSON.stringify(value)}\``
        })
    }

    if(value.length < this.minLength){
        return callback({
            path: path[0],
            message: `${path[1] || 'value'} must be of minimum length ${this.minLength}, but length was ${value.length}`
        })
    }

    if(value.length > this.maxLength){
        return callback({
            path: path[0],
            message: `${path[1] || 'value'} must be of maximum length ${this.maxLength}, but length was ${value.length}`
        })
    }

    var valid = righto.all(value.map((item, index) => {
        var itemPath = buildPath(path[0], index)
        return righto.surely((type && type instanceof SubSpec)
            ? righto(type, itemPath, item)
            : righto(discriminate(itemPath, type), item)
        )
    })).get(results => {
        var errors = results.map(result => result[0] && result[0].errors).filter(error => error);

        if(errors.length){
            return righto.fail(errors)
        }

        return results.map(result => result[1]);
    })

    valid(callback);
}

function discriminate(name, spec){
    if(arguments.length < 2){
        spec = name;
        name = null;
    }

    var path = [name, name];

    function Spec(parentPath, data, callback){
        if(arguments.length < 3){
            callback = data;
            data = parentPath;
        } else {
            path = parentPath;
        }

        function done(errors, result){
            if(errors){
                return callback({
                    message: 'Invalid ' + (name || 'data'),
                    errors: flatten(errors)
                })
            }

            callback(null, result);
        }

        if(isBaseType(spec)){
            return checkBaseType(spec, data, path, done);
        }

        if(!(this instanceof Spec)){
            return new Spec(data, callback);
        }

        if(spec instanceof Type){
            return spec.validate({}, data, path, function(error, result){
                return done(error && flatten([error]), result);
            });
        }

        check(spec, this, data, path, done);
    }
    Spec.prototype = Object.create(SubSpec.prototype);
    Spec.constructor = Spec;
    Spec.validate = function(data, callback){
        Spec(data, callback);
    }

    return Spec;
}

module.exports = discriminate;

module.exports.Required = Required;
module.exports.Maybe = Maybe;
module.exports.Custom = Custom;
module.exports.And = And;
module.exports.Or = Or;
module.exports.Any = Any;
module.exports.List = List;
