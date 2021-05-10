const {HONEYCOMB_API_TOKEN} = process.env;

const beeline = require("honeycomb-beeline")({
    // Get it on https://ui.honeycomb.io/account after signing up for Honeycomb
    writeKey: HONEYCOMB_API_TOKEN,
    // The name of your app is a good choice to start with
    dataset: "kaptures",
    serviceName: "kurator-service"
});

const handlerWithContext = async (ctx, handler) => {
    const trace = beeline.startTrace();

    return beeline.startAsyncSpan({
            task: ctx.OPERATION,
            type: ctx.TYPE,
        },
        async (span) => {
            try {
                return await handler();
            } catch (e) {
                beeline.addTraceContext({fileError: err.toString()});
            } finally {
                beeline.finishSpan(span);
                beeline.finishTrace(trace);
                beeline.flush();
            }
        },
    );
}


module.exports = {
    beeline,
    handlerWithContext,
}