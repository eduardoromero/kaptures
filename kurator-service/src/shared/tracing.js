const AWSXRay = require("aws-xray-sdk-core");
const http = AWSXRay.captureHTTPs(require('http'));
const https = AWSXRay.captureHTTPs(require('http'));
const TraceID = require("aws-xray-sdk-core/lib/segments/attributes/trace_id");
const {logger: Logger} = require("./logger");

AWSXRay.captureHTTPsGlobal(http);
AWSXRay.captureHTTPsGlobal(https);

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

const handlerWithXRayContext = async (ctx, handler) => {
    const {operation, type, awsRequestId = ""} = ctx;
    const {root, parent} = getTraceMetadata();
    let segment, { logger } = ctx;

    if (!ctx.logger) {
        logger = Logger;
        logger.info({operation, type});
    }

    if (!parent) {
        segment = new AWSXRay.Segment(operation, root);
        AWSXRay.setSegment(segment);
    } else {
        segment = new AWSXRay.Segment(`${type}-${operation}`, AWSXRay.getSegment().trace_id, AWSXRay.getSegment().parent_id)
    }

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

        logger.info(segment, "Root Segment");
    });
}

module.exports = {
    handlerWithXRayContext
}