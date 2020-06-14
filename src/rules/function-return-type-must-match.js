const {
    getContainingFunctionDeclaration,
    resolveTypeForFunctionDeclaration,
    resolveTypeForValue,
    storeProgram
} = require('../utils');

module.exports = {
    create: function(context) {
        const {
            allowImplicitUndefineds = false
        } = context.options[0] || {};

        return {
            Program(node) {
                storeProgram(node, context);
            },
            ReturnStatement(node) {
console.log(`QQ/node: ${node}`);
                const functionDeclaration = getContainingFunctionDeclaration(node, context);
console.log(`QQ/functionDeclaration: ${functionDeclaration.type}`);
                const expectedReturnType = resolveTypeForFunctionDeclaration(functionDeclaration, context);
console.log(`QQ/expectedReturnType: ${expectedReturnType}`);

                if (!node.argument && expectedReturnType) {
                    /* bare `return;` statement */

                    if (!expectedReturnType.includes(`undefined`)
                        && !allowImplicitUndefineds) {
                        context.report({
                            message: `returning an implicit undefined from a function declared to return ${expectedReturnType}`,
                            node
                        });
                    }

                    return;
                }

console.log(`QQ/actualReturnType/start`);
                const actualReturnType = resolveTypeForValue(node.argument, context);
console.log(`QQ/actualReturnType: ${actualReturnType}`);

                if (!expectedReturnType.isOfType(actualReturnType)) {
                    context.report({
                        message: `returning ${actualReturnType} from a function declared to return ${expectedReturnType}`,
                        node
                    });
                }
            }
        };
    }
};
