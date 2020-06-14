const {
    getArgumentsForFunction,
    getArgumentsForFunctionCall,
    getNameOfCalledFunction,
    storeProgram
} = require('../utils');

module.exports = {
    create: function(context) {
        return {
            CallExpression(node) {
                const functionName = getNameOfCalledFunction(node, context);
console.log(`QQ/function-args-length-must-match/functionName: ${functionName}`);
                const expectedArgs = getArgumentsForFunction(node, context);
console.log(`QQ/function-args-length-must-match/expectedArgs: ${expectedArgs}`);
                const args = getArgumentsForFunctionCall(node, context);
console.log(`QQ/function-args-length-must-match/args: ${args}`);

                if ((!expectedArgs || !expectedArgs.length)
                    && (args && args.length)) {
                    context.report({
                        message: `function ${functionName} expects no arguments but was called with ${args.length}`,
                        node
                    });
                } else if ((expectedArgs && expectedArgs.length)
                           && (!args || expectedArgs.length !== args.length)) {
                    context.report({
                        message: `function ${functionName} expects ${expectedArgs.length} arguments but was called with ${args.length}`,
                        node
                    });
                }
            },

            Program(node) {
                storeProgram(node, context);
            }
        };
    }
};
