const AWSXRay = require("aws-xray-sdk-core");
const LambdaEnv = require('aws-xray-sdk-core/lib/env/aws_lambda');
const TraceID = require("aws-xray-sdk-core/lib/segments/attributes/trace_id");
const {logger: Logger} = require("./logger");

AWSXRay.enableAutomaticMode();
AWSXRay.captureHTTPsGlobal(require('http'));
AWSXRay.captureHTTPsGlobal(require('https'));
AWSXRay.captureAWS(require('aws-sdk'));
AWSXRay.capturePromise();

function getTraceMetadata() {
    // _X_AMZN_TRACE_ID looks like 'Root=1-5ddf3ec9-03f86f7c6e879a40e30a2bd8;Parent=c27e2dbab5d56894;Sampled=1'
    const {_X_AMZN_TRACE_ID = ''} = process.env;
    let [root = '', parent = ''] = _X_AMZN_TRACE_ID.split(';');

    if (root.length && parent.length) {
        root = root.replace('Root=', '');
        parent = parent.replace('Parent=', '');
    } else {
        root = new TraceID();
        parent = null;
    }

    return {root, parent};
}

async function handlerWithXRayContext(ctx, handler) {
    const {operation, type, awsRequestId = ""} = ctx;
    const {root, parent} = getTraceMetadata();
    let segment, {logger} = ctx;

    if (!ctx.logger) {
        logger = Logger;
        logger.info({operation, type});
    }

    AWSXRay.setLogger({
        error: (message, meta) => logger.error(meta, message),
        warn: (message, meta) => logger.warn(meta, message),
        info: (message, meta) => logger.info(meta, message),
        debug: (message, meta) => logger.debug(meta, message),
    });

    if (!parent) {
        segment = new AWSXRay.Segment(operation, root);
    } else {
        // Update environment to the current AWS Lambda function running.
        // see https://github.com/aws/aws-xray-sdk-node/blob/master/packages/core/lib/env/aws_lambda.js
        LambdaEnv.init();
        segment = new AWSXRay.Segment(`${type}-${operation}`, AWSXRay.getSegment().trace_id, AWSXRay.getSegment().parent_id)
    }

    AWSXRay.setSegment(segment);

    return AWSXRay.captureAsyncFunc(operation, async (subsegment) => {
        subsegment.addAnnotation('awsRequestId', awsRequestId);
        subsegment.addAnnotation('operation', operation);
        subsegment.addAnnotation('type', type);

        try {
            return handler();
        } catch (e) {
            logger.error(e, "ERROR!");
            subsegment.addError(e);
        } finally {
            subsegment.close();
            subsegment.flush();
        }
    }, segment).finally(() => {
        segment.close();
        segment.flush();
    });
}

module.exports = {
    handlerWithXRayContext,
    AWSXRay,
}