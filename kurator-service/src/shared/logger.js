const pino = require('pino');

const formatters = {
    level (label, number) {
        return { level: `${label}`.toUpperCase() }
    }
}

const logger = pino({
    name: process.env.ARC_APP_NAME || "",
    formatters,
    redact: {
        paths: ['accessToken', '[*].accessToken'],
        censor: "~~~REDACTED~~~"
    }
});

function initialize(ctx = {}) {
    const context = {
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || "",
        ...ctx,
    };

    if (process.env['AMAZON_TRACE_ID']) {
        context.trace = process.env['AMAZON_TRACE_ID'];
    }

    return logger.child({...context});
}

module.exports = {
    logger,
    initialize,
}