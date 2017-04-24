/*global define*/
define([
        '../Core/clone',
        '../Core/Color',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/defineProperties',
        './Expression'
    ], function(
        clone,
        Color,
        defaultValue,
        defined,
        defineProperties,
        Expression) {
    'use strict';

    /**
     * Evaluates a conditions expression defined using the
     * {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/Styling|3D Tiles Styling language}.
     * <p>
     * Implements the {@link StyleExpression} interface.
     * </p>
     *
     * @alias ConditionsExpression
     * @constructor
     *
     * @param {Object} [conditionsExpression] The conditions expression defined using the 3D Tiles Styling language.
     *
     * @example
     * var expression = new Cesium.Expression({
     *     expression : 'regExp("^1(\\d)").exec(${id})',
     *     expressions : {
     *         id : "RegEx('^1(\\d)$').exec(${id})",
     *         area : "${length} * ${height}"
     *     },
     *     conditions : [
     *         ['${expression} === "1"', 'color("#FF0000")'],
     *         ['${expression} === "2"', 'color("#00FF00")'],
     *         ["(${ID} !== 1) && (${AREA} > 0)", "color('#0000FF')"],
     *         ['true', 'color("#FFFFFF")']
     *     ]
     * });
     * expression.evaluateColor(frameState, feature, result); // returns a Cesium.Color object
     *
     * @see {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/Styling|3D Tiles Styling language}
     */
    function ConditionsExpression(conditionsExpression) {
        this._conditionsExpression = clone(conditionsExpression, true);
        this._conditions = conditionsExpression.conditions;

        // Insert expression to expressions if it exists
        // Then evaluate using expressions throughout class
        this._expression = conditionsExpression.expression; // this has to stay in prototype for tests to keep running
        this._expressions = conditionsExpression.expressions || {};
        this._expressions.expression = conditionsExpression.expression;

        this._runtimeConditions = undefined;

        setRuntime(this);
    }

    defineProperties(ConditionsExpression.prototype, {
        /**
         * Gets the conditions expression defined in the 3D Tiles Styling language.
         *
         * @memberof ConditionsExpression.prototype
         *
         * @type {Object}
         * @readonly
         *
         * @default undefined
         */
        conditionsExpression : {
            get : function() {
                return this._conditionsExpression;
            }
        }
    });

    function Statement(condition, expression) {
        this.condition = condition;
        this.expression = expression;
    }

    function setRuntime(expression) {
        var runtimeConditions = [];
        var conditions = expression._conditions;
        if (defined(conditions)) {
            var expressions = expression._expressions;
            var length = conditions.length;
            for (var i = 0; i < length; ++i) {
                var statement = conditions[i];
                var cond = String(statement[0]);
                var condExpression = String(statement[1]);

                //Loop over all expressions for replacement instead of only replacing one
                for (var key in expressions) {
                    if (expressions.hasOwnProperty((key))) {
                        console.log('in key: ' + key);
                        var expressionPlaceholder = new RegExp('\\$\\{' + key + '\\}', 'g');
                        if (defined(expressions[key])) {
                            cond = cond.replace(expressionPlaceholder, expressions[key]);
                            condExpression = condExpression.replace(expressionPlaceholder, expressions[key]);
                            console.log('defined replacement: ' + cond + ', ' + condExpression);
                        } else {
                            cond = cond.replace(expressionPlaceholder, 'undefined');
                            condExpression = condExpression.replace(expressionPlaceholder, 'undefined');
                            console.log('undefined replacement: ' + condExpression);
                        }
                    }
                }

                runtimeConditions.push(new Statement(
                    new Expression(cond),
                    new Expression(condExpression)
                ));
            }
        }

        expression._runtimeConditions = runtimeConditions;
    }

    /**
     * Evaluates the result of an expression, optionally using the provided feature's properties. If the result of
     * the expression in the
     * {@link https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/Styling|3D Tiles Styling language}
     * is of type <code>Boolean</code>, <code>Number</code>, or <code>String</code>, the corresponding JavaScript
     * primitive type will be returned. If the result is a <code>RegExp</code>, a Javascript <code>RegExp</code>
     * object will be returned. If the result is a <code>Color</code>, a {@link Color} object will be returned.
     *
     * @param {FrameState} frameState The frame state.
     * @param {Cesium3DTileFeature} feature The feature who's properties may be used as variables in the expression.
     * @returns {Boolean|Number|String|Color|RegExp} The result of evaluating the expression.
     */
    ConditionsExpression.prototype.evaluate = function(frameState, feature) {
        var conditions = this._runtimeConditions;
        if (defined(conditions)) {
            var length = conditions.length;
            for (var i = 0; i < length; ++i) {
                var statement = conditions[i];
                if (statement.condition.evaluate(frameState, feature)) {
                    return statement.expression.evaluate(frameState, feature);
                }
            }
        }
    };

    /**
     * Evaluates the result of a Color expression, using the values defined by a feature.
     *
     * @param {FrameState} frameState The frame state.
     * @param {Cesium3DTileFeature} feature The feature who's properties may be used as variables in the expression.
     * @param {Color} [result] The object in which to store the result
     * @returns {Color} The modified result parameter or a new Color instance if one was not provided.
     */
    ConditionsExpression.prototype.evaluateColor = function(frameState, feature, result) {
        var conditions = this._runtimeConditions;
        if (defined(conditions)) {
            var length = conditions.length;
            for (var i = 0; i < length; ++i) {
                var statement = conditions[i];
                if (statement.condition.evaluate(frameState, feature)) {
                    return statement.expression.evaluateColor(frameState, feature, result);
                }
            }
        }
    };

    /**
     * Gets the shader function for this expression.
     * Returns undefined if the shader function can't be generated from this expression.
     *
     * @param {String} functionName Name to give to the generated function.
     * @param {String} attributePrefix Prefix that is added to any variable names to access vertex attributes.
     * @param {Object} shaderState Stores information about the generated shader function, including whether it is translucent.
     * @param {String} returnType The return type of the generated function.
     *
     * @returns {String} The shader function.
     *
     * @private
     */
    ConditionsExpression.prototype.getShaderFunction = function(functionName, attributePrefix, shaderState, returnType) {
        var conditions = this._runtimeConditions;
        if (!defined(conditions) || conditions.length === 0) {
            return undefined;
        }

        var shaderFunction = '';
        var length = conditions.length;
        for (var i = 0; i < length; ++i) {
            var statement = conditions[i];
            var condition = statement.condition.getShaderExpression(attributePrefix, shaderState);
            var expression = statement.expression.getShaderExpression(attributePrefix, shaderState);

            if (!defined(condition) || !defined(expression)) {
                return undefined;
            }

            // Build the if/else chain from the list of conditions
            shaderFunction +=
                '    ' + ((i === 0) ? 'if' : 'else if') + ' (' + condition + ') \n' +
                '    { \n' +
                '        return ' + expression + '; \n' +
                '    } \n';
        }

        shaderFunction = returnType + ' ' + functionName + '() \n' +
            '{ \n' +
                 shaderFunction +
            '    return ' + returnType + '(1.0); \n' + // Return a default value if no conditions are met
            '} \n';

        return shaderFunction;
    };

    return ConditionsExpression;
});

---

var expressionPlaceholder = new RegExp('${expression}', 'g');
undefined
'${expression} > 25'.replace(expressionPlaceholder, 'YES');
"${expression} > 25"
'${expression} > 25 - ${expression}'.replace(expressionPlaceholder, 'YES');
"${expression} > 25 - ${expression}"
expressionPlaceholder
/${expression}/g
var expressionPlaceholder = new RegExp('\$\{expression\}', 'g');
undefined
'${expression} > 25 - ${expression}'.replace(expressionPlaceholder, 'YES');
"${expression} > 25 - ${expression}"
'\$\{expression\} > 25 - \$\{expression\}'.replace(expressionPlaceholder, 'YES');
"${expression} > 25 - ${expression}"
('\$\{expression\} > 25 - \$\{expression\}').replace(expressionPlaceholder, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp('\$\{expression\}', 'g');
undefined
('\$\{expression\} > 25 - \$\{expression\}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp('\$\{expression\}', 'g');
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp('\$\{expression?\}', 'g');
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp('${expression}', 'g');
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp(\$\{expression\}, 'g');
VM12934:1 Uncaught SyntaxError: Invalid or unexpected token
var reg = \$\{test\}\g
VM12985:1 Uncaught SyntaxError: Invalid or unexpected token
"{expression}".match(/expression/)
    ["expression"]
"{expression}".match(/\{expression/)
    ["{expression"]
"{expression}".match(/\{expression\}/)
    ["{expression}"]
"{expression}".match(/\$\{expression\}/)
null
"${expression}".match(/\$\{expression\}/)
    ["${expression}"]
var toReplace = new RegExp('/\$\{expression\}/', 'g');
undefined
"${expression}".match(/\$\{expression\}/)
    ["${expression}"]
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
"${expression}".match(toReplace)
null
var toReplace = new RegExp('/\$\{expression\}/', 'g')
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp(/\$\{expression\}/, 'g')
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"YES > 25 - YES"
var toReplace = new RegExp(/\$\{expression\}/, 'g')
undefined
var key = 'expression'
undefined
var toReplace = new RegExp('/\$\{' + key + '\}/', 'g')
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp('\$\{' + key + '\}', 'g')
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp("\$\{" + key + "\}", 'g')
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var toReplace = new RegExp(/\$\{expression\}/, 'g')
undefined
var str = '\$\{' + key + '\}'
undefined
str
"${expression}"
var toReplace = new RegExp(str, 'g')
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"${expression} > 25 - ${expression}"
var str = '\\$\\{' + key + '\\}'
undefined
str
"\$\{expression\}"
var toReplace = new RegExp("\\$\\{" + key + "\\}", 'g')
undefined
('${expression} > 25 - ${expression}').replace(toReplace, 'YES');
"YES > 25 - YES"
